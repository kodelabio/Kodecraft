#!/usr/bin/env node

/**
 * Test script to debug example similarity matching
 * Usage: node test_similarity.js
 */

import { readFileSync } from 'fs';
import { cosineSimilarity } from './src/utils/math.js';
import { wordOverlapScore } from './src/utils/text.js';

// Load embeddings
const embeddings = JSON.parse(readFileSync('./data/embeddings/embeddings.json', 'utf8'));

// Simulate the Examples.turnsToText logic
function turnsToText(turns) {
    let messages = '';
    for (let turn of turns) {
        if (turn.role !== 'assistant')
            messages += turn.content.substring(turn.content.indexOf(':')+1).trim() + '\n';
    }
    return messages.trim();
}

// Test prompts
const testPrompts = [
    {
        name: "Combat with Lead329",
        turns: [
            {
                role: "user",
                content: `user: COMBAT MISSION: TASK: {"target":"Lead329's workers","quantity":2}

Location: the target area
Role: TANK
Target: Lead329's workers (controlled by Lead329)
Target Type: player

OBJECTIVE: Engage the first available worker from Lead329's team.

INSTRUCTIONS:
You are the tank. Equip your best sword or axe. Search for any Lead329's worker within 30 blocks of your position. Once found, approach from the front and attack immediately with continuous melee assault. Keep attacking for up to 60 seconds. If your target is destroyed or flees beyond 30 blocks, search for another available worker. Maintain at least 3 blocks distance from Soldier2. If your health drops below 7 hearts (14 HP), retreat immediately.

CONSTRAINTS:
- Stay within 30 blocks of your target
- Maintain at least 3 blocks distance from Soldier2
- If target destroyed or flees, acquire next available target
- Abort if no targets found after 60 seconds

HEALTH RETREAT: Below 14 HP (7 hearts)

COMBAT DURATION: 60 seconds max

ASSIGNED TARGET: Lead329_W1
STARTING POSITION: (-416, -61, 7) - east side
RALLY POINT: (-421, -61, 7)
COMBAT RADIUS: 20 blocks from rally point`
            }
        ]
    },
    {
        name: "Build dirt house",
        turns: [
            {
                role: "user",
                content: "brug: build a dirt house"
            }
        ]
    },
    {
        name: "Go to oak log",
        turns: [
            {
                role: "user",
                content: "maya: go to the nearest oak log"
            }
        ]
    }
];

// Get example embeddings from _default profile
const defaultCodingEmbeddings = embeddings.examples._default.coding;
console.log(`\n📊 Found ${Object.keys(defaultCodingEmbeddings).length} coding examples in _default\n`);

// Load _default.json to get example texts
const defaultProfile = JSON.parse(readFileSync('./profiles/defaults/_default.json', 'utf8'));
const codingExamples = defaultProfile.coding_examples;

console.log('═'.repeat(80));
console.log('SIMILARITY TEST RESULTS');
console.log('═'.repeat(80));

// Test each prompt
for (const testPrompt of testPrompts) {
    console.log(`\n🔍 Testing: "${testPrompt.name}"`);
    console.log('─'.repeat(80));
    
    const testText = turnsToText(testPrompt.turns);
    console.log(`Input text: ${testText.substring(0, 100)}...`);
    console.log('');
    
    // Calculate similarity to each example
    const scores = [];
    
    Object.entries(defaultCodingEmbeddings).forEach(([index, embedding]) => {
        const exampleTurns = codingExamples[parseInt(index)];
        const exampleText = turnsToText(exampleTurns);
        
        // Get cosine similarity
        const cosineSim = cosineSimilarity(testText, embedding); // This won't work - testText isn't embedded
        const wordSim = wordOverlapScore(testText, exampleText);
        
        scores.push({
            index: parseInt(index),
            examplePreview: exampleText.substring(0, 60).replace(/\n/g, ' '),
            wordSimilarity: wordSim
        });
    });
    
    // Sort by similarity
    scores.sort((a, b) => b.wordSimilarity - a.wordSimilarity);
    
    console.log('Top 5 ranked examples (by word overlap):');
    scores.slice(0, 5).forEach((score, rank) => {
        console.log(`  ${rank + 1}. [Index ${score.index}] Score: ${score.wordSimilarity.toFixed(3)} | ${score.examplePreview}`);
    });
}

console.log('\n' + '═'.repeat(80));
console.log('NOTES:');
console.log('- Word overlap is calculated without embeddings (faster for testing)');
console.log('- Actual selection uses cosine similarity on embeddings');
console.log('- Need to add embedding test capability');
console.log('═'.repeat(80));
