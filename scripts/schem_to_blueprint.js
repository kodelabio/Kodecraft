// schem_to_blueprint.js
import fs from 'fs';
import path from 'path';
import { itemMappings } from './item_mappings.js';

function schemToBlueprint(schematicJsonPath, name, metadata = {}, baseX = 0, baseY = -60, baseZ = 0) {
    console.log(`schemToBlueprint called with name: "${name}"`);  // Debug
    const schematic = JSON.parse(fs.readFileSync(schematicJsonPath, 'utf8'));
    const blockList = schematic.blocks;

    // Group blocks by Y level and count materials
    const levelMap = {};
    const materials = {};

    //console.log('blockList type:', typeof blockList);
    //console.log('blockList is array?', Array.isArray(blockList));
    //console.log('blockList keys:', Object.keys(blockList).slice(0, 5));
    //console.log('blockList sample:', JSON.stringify(blockList).substring(0, 200));

    for (const block of blockList) {
        const y = block.y;
        let blockType = block.block.split('[')[0].split(':').pop(); // Remove properties
        // Apply mapping if needed
        blockType = itemMappings[blockType] || blockType;

        materials[blockType] = (materials[blockType] || 0) + 1;

        if (!levelMap[y]) {
            levelMap[y] = [];
        }
        levelMap[y].push({
            x: block.x,
            z: block.z,
            material: blockType.split(':').pop()  // Removes "minecraft:" prefix
        });
    }

    // Convert to levels array (sorted by Y)
    const levels = Object.keys(levelMap)
        .map(Number)
        .sort((a, b) => a - b)
        .map((y, index) => ({
            level: index + 1,
            coordinates: [baseX, y + baseY, baseZ],  // Use parameters
            blocks: levelMap[y]
        }));

    // Build blueprint
    const totalBlocks = Object.values(materials).reduce((a, b) => a + b, 0);
    const blueprint = {
        [name]: {
            source: "schematic",
            type: "construction",
            verified: true,
            goal: `Build the ${name}`,
            conversation: `Let's build the ${name} together`,
            agent_count: 1,
            timeout: 300000,
            metadata: {
                description: metadata.description || `A ${name}`,
                totalBlocks: totalBlocks,
                dimensions: metadata.dimensions || { width: null, height: null, length: null },
                author: metadata.author || null,
                created: metadata.created || null,
                perimeter: metadata.perimeter || null
            },
              // Add perimeter
            blueprint: {
                materials: materials,
                levels: levels
            },
            initial_inventory: {
                "0": materials
            }
        }
    };

    return blueprint;
}

let [, , jsonPath, blueprintName, metadataJson] = process.argv;

// Extract filename without extension if not provided
if (!blueprintName) {
    blueprintName = path.basename(jsonPath, '.json');
} else {
    // If provided, also strip the path and extension
    blueprintName = path.basename(blueprintName, '.json');
}

// Remove any "blueprints/" prefix that might be in the name
blueprintName = blueprintName.replace(/^blueprints[\/\\]/, '');

console.log(`Using blueprint name: ${blueprintName}`);  // Debug

const metadata = metadataJson ? JSON.parse(metadataJson) : {};

const blueprint = schemToBlueprint(jsonPath, blueprintName, metadata);  // Pass stripped name
const outPath = `${blueprintName}_blueprint.json`;
fs.writeFileSync(outPath, JSON.stringify(blueprint, null, 2));

console.log(`✅ Saved: ${outPath}`);