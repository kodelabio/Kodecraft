// schem_to_mongo.js
// Converts a .schem (Sponge Schematic) file to a MongoDB-ready JSON document
//
// Usage: node schem_to_mongo.js <input.schem> [output.json]
//
// Output JSON structure:
// {
//   meta: { name, dimensions, blockCount, createdAt, schematicVersion },
//   palette: { "minecraft:stone": 0, ... },
//   blocks: [ { x, y, z, block, properties } ... ],  // non-air only
//   rawBlockData: [...]  // full flat array if you need it
// }

import nbt from 'prismarine-nbt';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { gunzip } from 'zlib';

const gunzipAsync = promisify(gunzip);

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse block name + properties from a palette entry
 * e.g. "minecraft:oak_stairs[facing=north,half=bottom]"
 *   -> { block: "minecraft:oak_stairs", properties: { facing: "north", half: "bottom" } }
 */
function parseBlockState(fullName) {
    const match = fullName.match(/^([^\[]+)(?:\[([^\]]*)\])?$/);
    if (!match) return { block: fullName, properties: {} };

    const block = match[1];
    const properties = {};

    if (match[2]) {
        match[2].split(',').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value !== undefined) properties[key.trim()] = value.trim();
        });
    }

    return { block, properties };
}

/**
 * Safely extract a value from an NBT node (handles different nbt shapes)
 */
function nbtVal(node) {
    if (node === undefined || node === null) return null;
    if (typeof node !== 'object') return node;
    // prismarine-nbt wraps values in { type, value }
    if ('value' in node) return nbtVal(node.value);
    return node;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function schemToMongo(inputPath, outputPath) {
    console.log(`📂 Reading: ${inputPath}`);

    // Read file
    let raw = fs.readFileSync(inputPath);

    // Decompress if gzipped (most .schem files are)
    try {
        raw = await gunzipAsync(raw);
        console.log('🗜  Decompressed gzip successfully');
    } catch {
        console.log('ℹ️  File is not gzipped, parsing raw');
    }

    // Parse NBT
    const { parsed } = await nbt.parse(raw);
    const root = parsed.value;

    //console.log('DEBUG: parsed structure:', JSON.stringify(parsed, null, 2).substring(0, 500));
    //console.log('DEBUG: root keys:', Object.keys(root));
    //console.log('DEBUG: root.value exists?', 'value' in root);

    // ── Extract dimensions ──────────────────────────────────────────────────
    const schematic = nbtVal(root.Schematic);
    if (!schematic) throw new Error('No Schematic compound found');

    const width  = nbtVal(schematic.Width);
    const height = nbtVal(schematic.Height);
    const length = nbtVal(schematic.Length);

    if (!width || !height || !length) {
        throw new Error('Could not read Width/Height/Length from schematic. Is this a valid .schem file?');
    }

    console.log(`📐 Dimensions: ${width} x ${height} x ${length}`);
    const blocks = nbtVal(schematic.Blocks);
    if (!blocks) throw new Error('No Blocks compound found in schematic');

    const rawPalette = nbtVal(blocks.Palette);
    if (!rawPalette) throw new Error('No Palette found in schematic');

    // palette: blockStateName -> paletteIndex
    const palette = {};
    for (const [name, val] of Object.entries(rawPalette)) {
        palette[name] = nbtVal(val);
    }

    // Invert: paletteIndex -> blockStateName
    const indexToName = {};
    for (const [name, idx] of Object.entries(palette)) {
        indexToName[idx] = name;
    }

    console.log(`🎨 Palette size: ${Object.keys(palette).length} block types`);

    // ── Extract block data ──────────────────────────────────────────────────
    const blockData = nbtVal(blocks.Data);
    if (!blockData) throw new Error('No BlockData found in schematic');


    // BlockData is a varint-encoded byte array in .schem v2+
    // prismarine-nbt gives us a Buffer or Int8Array; decode varints manually
    const indices = decodeVarintArray(blockData, width * height * length);

    console.log(`🧱 Total blocks: ${indices.length} (${width * height * length} expected)`);

    // ── Build block list (skip air) ─────────────────────────────────────────
    const blockList = []; 
    let airCount = 0;

    for (let y = 0; y < height; y++) {
        for (let z = 0; z < length; z++) {
            for (let x = 0; x < width; x++) {
                const i = y * width * length + z * width + x;
                const paletteIdx = indices[i];
                const fullName = indexToName[paletteIdx] ?? 'minecraft:air';

                if (fullName === 'minecraft:air') {
                    airCount++;
                    continue;
                }

                const { block, properties } = parseBlockState(fullName);

                const entry = { x, y, z, block };
                if (Object.keys(properties).length > 0) entry.properties = properties;

                blockList.push(entry);
            }
        }
    }

    console.log(`✅ Non-air blocks: ${blockList.length} (skipped ${airCount} air blocks)`);

    // ── Build MongoDB document ──────────────────────────────────────────────
    const schematicName = path.basename(inputPath, path.extname(inputPath));

    const mongoDoc = {
        // Metadata — useful for querying in MongoDB
        meta: {
            name: schematicName,
            source: path.basename(inputPath),
            schematicVersion: nbtVal(root.Version) ?? null,
            dataVersion: nbtVal(root.DataVersion) ?? null,
            dimensions: { width, height, length },
            blockCount: blockList.length,
            totalVolume: width * height * length,
            createdAt: new Date().toISOString()
        },

        // Palette — block name to palette index map
        // Stored as an array for cleaner MongoDB querying
        palette: Object.entries(palette).map(([name, idx]) => {
            const { block, properties } = parseBlockState(name);
            return {
                index: idx,
                fullName: name,
                block,
                ...(Object.keys(properties).length > 0 && { properties })
            };
        }).sort((a, b) => a.index - b.index),

        // Individual blocks (non-air only)
        // Each doc: { x, y, z, block, properties? }
        blocks
    };

    // ── Write output ────────────────────────────────────────────────────────
    const outPath = outputPath ?? `${schematicName}.json`;
    fs.writeFileSync(outPath, JSON.stringify(mongoDoc, null, 2));

    const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`\n💾 Saved to: ${outPath} (${sizeKB} KB)`);
    console.log(`\n📋 MongoDB document summary:`);
    console.log(`   Collection suggestion: "schematics"`);
    console.log(`   Document name:         ${schematicName}`);
    console.log(`   Block types:           ${Object.keys(palette).length}`);
    console.log(`   Blocks to place:       ${blockList.length}`);
    console.log(`   Volume:                ${width * height * length} voxels`);
}

// ─── Varint decoder ──────────────────────────────────────────────────────────
// .schem stores BlockData as a packed varint byte array

function decodeVarintArray(buffer, expectedCount) {
    const result = [];
    let i = 0;
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    while (i < bytes.length && result.length < expectedCount) {
        let value = 0;
        let shift = 0;
        let byte;

        do {
            if (i >= bytes.length) break;
            byte = bytes[i++] & 0xff;
            value |= (byte & 0x7f) << shift;
            shift += 7;
        } while (byte & 0x80);

        result.push(value);
    }

    // Pad with 0 (air) if short
    while (result.length < expectedCount) result.push(0);

    return result;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const [,, inputArg, outputArg] = process.argv;

if (!inputArg) {
    console.error('Usage: node schem_to_json.js <input.schem> [output.json]');
    process.exit(1);
}

if (!fs.existsSync(inputArg)) {
    console.error(`File not found: ${inputArg}`);
    process.exit(1);
}

schemToMongo(inputArg, outputArg).catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});