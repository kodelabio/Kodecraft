#!/usr/bin/env node
/**
 * Validate Minecraft block names against mineflayer's block registry
 * Usage: node validate_blocks.js <materials_json_file>
 * Or: node validate_blocks.js "oak_stairs,jungle_planks,terracotta"
 */

import mineflayer from 'mineflayer';
import fs from 'fs';

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
    console.error('Usage: node validate_blocks.js <materials_json_file>');
    console.error('   or: node validate_blocks.js "material1,material2,material3"');
    console.error('\nExample: node validate_blocks.js blueprint.json');
    console.error('Example: node validate_blocks.js "oak_stairs,jungle_planks,terracotta"');
    process.exit(1);
}

// Load materials from either JSON file or comma-separated list
let materials = [];
const input = args[0];

if (input.includes(',')) {
    // Comma-separated list
    materials = input.split(',').map(m => m.trim());
    console.log(`Validating ${materials.length} materials from command line...\n`);
} else if (fs.existsSync(input)) {
    // JSON file
    try {
        const data = JSON.parse(fs.readFileSync(input, 'utf8'));
        
        // Extract materials from blueprint structure
        // Handle different JSON structures:
        // 1. { "structure_name": { "blueprint": { "materials": {...} } } }
        // 2. { "blueprint": { "materials": {...} } }
        // 3. { "materials": {...} }
        // 4. ["material1", "material2", ...]
        
        if (Array.isArray(data)) {
            materials = data;
        } else {
            // Get first key if top-level is a structure name
            const firstKey = Object.keys(data)[0];
            const topLevel = data[firstKey] || data;
            
            if (topLevel.blueprint && topLevel.blueprint.materials) {
                materials = Object.keys(topLevel.blueprint.materials);
            } else if (data.blueprint && data.blueprint.materials) {
                materials = Object.keys(data.blueprint.materials);
            } else if (data.materials) {
                materials = Object.keys(data.materials);
            } else {
                console.error('Could not find materials in JSON file');
                console.error('Expected structure: { "structure_name": { "blueprint": { "materials": {...} } } }');
                process.exit(1);
            }
        }
        
        console.log(`Validating ${materials.length} materials from ${input}...\n`);
    } catch (err) {
        console.error(`Error reading JSON file: ${err.message}`);
        process.exit(1);
    }
} else {
    console.error(`File not found: ${input}`);
    process.exit(1);
}

// Create a temporary bot to access the registry
// We don't need to actually connect to a server
const bot = mineflayer.createBot({
    host: 'invalid-host-just-for-registry',
    username: 'validator',
    version: '1.21.4',  // Match your server version
});

// Give it a moment to initialize the registry
setTimeout(() => {
    console.log('═'.repeat(70));
    console.log('MINECRAFT BLOCK VALIDATION RESULTS');
    console.log('═'.repeat(70));
    
    const validBlocks = [];
    const invalidBlocks = [];
    
    materials.forEach(material => {
        const block = bot.registry.blocksByName[material];
        if (block) {
            validBlocks.push(material);
            console.log(`✓ ${material.padEnd(40)} [ID: ${block.id}]`);
        } else {
            invalidBlocks.push(material);
            console.log(`✗ ${material.padEnd(40)} INVALID - NOT FOUND`);
        }
    });
    
    console.log('\n' + '═'.repeat(70));
    console.log('SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Total materials: ${materials.length}`);
    console.log(`✓ Valid: ${validBlocks.length}`);
    console.log(`✗ Invalid: ${invalidBlocks.length}`);
    
    if (invalidBlocks.length > 0) {
        console.log('\n' + '═'.repeat(70));
        console.log('INVALID BLOCKS (need mapping fixes):');
        console.log('═'.repeat(70));
        invalidBlocks.forEach(block => {
            console.log(`  ✗ ${block}`);
            
            // Suggest fixes for common patterns
            if (block.includes('_wood_stairs')) {
                const fixed = block.replace('_wood_stairs', '_stairs');
                const exists = bot.registry.blocksByName[fixed];
                if (exists) {
                    console.log(`    → Suggestion: "${fixed}" (VALID)`);
                }
            }
            if (block.includes('_wood_plank')) {
                const fixed = block.replace('_wood_plank', '_planks');
                const exists = bot.registry.blocksByName[fixed];
                if (exists) {
                    console.log(`    → Suggestion: "${fixed}" (VALID)`);
                }
            }
            if (block.endsWith('_plank')) {
                const fixed = block + 's';
                const exists = bot.registry.blocksByName[fixed];
                if (exists) {
                    console.log(`    → Suggestion: "${fixed}" (VALID)`);
                }
            }
        });
    }
    
    console.log('\n');
    
    // Exit
    process.exit(invalidBlocks.length > 0 ? 1 : 0);
}, 1000);