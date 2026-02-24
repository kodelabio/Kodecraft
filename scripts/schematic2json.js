// schematic2json.js
// Converts a .schematic (WorldEdit format) file to JSON
//
// Usage: node schematic2json.js <input.schematic> [output.json]

import nbt from 'prismarine-nbt';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { gunzip } from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const legacyBlockIds = JSON.parse(fs.readFileSync(path.join(__dirname, 'legacy_blocks_ids.json'), 'utf8'));



const gunzipAsync = promisify(gunzip);

// ─── Helpers ────────────────────────────────────────────────────────────────

function getLegacyBlockMap() {
    return legacyBlockIds;
}

/**
 * Parse block name + properties from a palette entry
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
 * Safely extract a value from an NBT node
 */
function nbtVal(node) {
    if (node === undefined || node === null) return null;
    if (typeof node !== 'object') return node;
    if ('value' in node) return nbtVal(node.value);
    return node;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function schematicToJSON(inputPath, outputPath) {
    console.log(`📂 Reading: ${inputPath}`);

    // Read file
    let raw = fs.readFileSync(inputPath);

    // Decompress if gzipped
    try {
        raw = await gunzipAsync(raw);
        console.log('🗜  Decompressed gzip successfully');
    } catch {
        console.log('ℹ️  File is not gzipped, parsing raw');
    }

    // Parse NBT
    const { parsed } = await nbt.parse(raw);
    const root = parsed.value;

    // ── Extract dimensions ──────────────────────────────────────────────────
    const width = nbtVal(root.Width);
    const height = nbtVal(root.Height);
    const length = nbtVal(root.Length);

    if (!width || !height || !length) {
        throw new Error('Could not read Width/Height/Length from schematic');
    }

    console.log(`📐 Dimensions: ${width} x ${height} x ${length}`);
    const tileEntities = nbtVal(root.TileEntities);
    //console.log('DEBUG: TileEntities sample:', JSON.stringify(tileEntities, null, 2).substring(0, 1000));
    //console.log('DEBUG: root keys:', Object.keys(root).slice(0, 20));
    //console.log('DEBUG: full root structure:', JSON.stringify(root, null, 2).substring(0, 1000));

    // ── Extract palette from Materials ──────────────────────────────────────────
    // ── Extract palette ─────────────────────────────────────────────────────────
    // ── Extract palette from Materials ──────────────────────────────────────────
    let rawPalette = nbtVal(root.Palette);

    if (!rawPalette) {
        console.log('⚠️  No palette found, building from block IDs');
        // For old WorldEdit format, build palette from actual block IDs in the data
        const blockIds = nbtVal(root.Blocks);
        const uniqueIds = new Set(
            Array.isArray(blockIds) 
                ? blockIds.map(b => nbtVal(b))
                : Object.values(blockIds).map(b => nbtVal(b))
        );
        
        rawPalette = {};
        const legacyMap = getLegacyBlockMap();
        
        for (const id of uniqueIds) {
            const blockName = legacyMap[id] || `minecraft:block_${id}`;
            rawPalette[blockName] = id;
        }
        
        console.log(`🔍 Found ${uniqueIds.size} unique block IDs in file`);
    }

    // Palette: blockStateName -> paletteIndex
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
    const blockData = nbtVal(root.Blocks);
    if (!blockData) throw new Error('No Blocks found in schematic');
    


    // blockData is directly an array of palette indices
    const indices = Array.isArray(blockData) 
        ? blockData.map(b => nbtVal(b))
        : Object.values(blockData).map(b => nbtVal(b));

    console.log(`🧱 Total blocks: ${indices.length} (${width * height * length} expected)`);
    //console.log(`DEBUG: indices length: ${indices.length}, indexToName keys: ${Object.keys(indexToName).length}`);
    //console.log(`DEBUG: sample indices: ${indices.slice(0, 20)}`);
    //console.log(`DEBUG: sample indexToName: ${JSON.stringify(Object.entries(indexToName).slice(0, 10))}`);

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

    // ── Build output document ───────────────────────────────────────────────
    const schematicName = path.basename(inputPath, path.extname(inputPath));

    const output = {
        meta: {
            name: schematicName,
            source: path.basename(inputPath),
            dimensions: { width, height, length },
            blockCount: blockList.length,
            totalVolume: width * height * length,
            createdAt: new Date().toISOString()
        },
        palette: Object.entries(palette).map(([name, idx]) => {
            const { block, properties } = parseBlockState(name);
            return {
                index: idx,
                fullName: name,
                block,
                ...(Object.keys(properties).length > 0 && { properties })
            };
        }).sort((a, b) => a.index - b.index),
        blocks: blockList
    };

    // ── Write output ────────────────────────────────────────────────────────
    const outPath = outputPath ?? `${schematicName}.json`;
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

    const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`\n💾 Saved to: ${outPath} (${sizeKB} KB)`);
    console.log(`📋 Summary: ${blockList.length} blocks, ${Object.keys(palette).length} block types`);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const [, , inputArg, outputArg] = process.argv;

if (!inputArg) {
    console.error('Usage: node schematic2json.js <input.schematic> [output.json]');
    process.exit(1);
}

if (!fs.existsSync(inputArg)) {
    console.error(`File not found: ${inputArg}`);
    process.exit(1);
}

schematicToJSON(inputArg, outputArg).catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});