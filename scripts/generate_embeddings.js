#!/usr/bin/env node
/**
 * scripts/generate-embeddings.js
 * Pre-generate embeddings for examples and skill docs
 * Run once at startup or when profiles change
 * 
 * Usage: node scripts/generate-embeddings.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import settings from '../settings.js';
import { getSkillDocs } from '../src/agent/library/index.js';

const EMBEDDINGS_DIR = './data/embeddings';
const EMBEDDINGS_FILE = `${EMBEDDINGS_DIR}/embeddings.json`;

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('🔄 EMBEDDING GENERATION SCRIPT');
console.log('═══════════════════════════════════════════════════════════════\n');

async function generateEmbeddings() {
    try {
        // Create embeddings directory
        mkdirSync(EMBEDDINGS_DIR, { recursive: true });

        // Get all profiles
        const profiles = settings.profiles || [];
        if (profiles.length === 0) {
            throw new Error('No profiles found in settings');
        }

        // Load first profile to get embedding config
        const firstProfile = JSON.parse(readFileSync(profiles[0], 'utf8'));
        console.log(`Loaded profile: ${firstProfile.name || 'unknown'}`);

        // Initialize embedding model
        console.log('📦 Initializing embedding model...');
        const embeddingConfig = firstProfile.embedding;
        if (!embeddingConfig?.api) {
            throw new Error('No embedding config found in profile');
        }

        // Import the appropriate model class based on API
        let ModelClass;
        if (embeddingConfig.api === 'openai') {
            const { GPT } = await import('../src/models/gpt.js');
            ModelClass = GPT;
        } else if (embeddingConfig.api === 'huggingface') {
            const { HuggingFace } = await import('../src/models/huggingface.js');
            ModelClass = HuggingFace;
        } else {
            throw new Error(`Unsupported embedding API: ${embeddingConfig.api}`);
        }

        const embeddingModel = new ModelClass(
            embeddingConfig.model,
            embeddingConfig.url,
            embeddingConfig.params
        );
        console.log(`✅ Embedding model initialized (${embeddingConfig.api})`);
        
        const embeddings = {
            timestamp: new Date().toISOString(),
            examples: {},
            skills: {}
        };

        // Process each profile's examples
        console.log('\n📚 Processing profiles...');
        // Also add defaults
        const allProfiles = [
            ...profiles,
            './profiles/defaults/_default.json'
        ];
        for (const profilePath of allProfiles   ) {
            try {
                console.log(`\n   📖 Processing: ${profilePath}`);
                const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
                
                const profileName = profilePath.split('/').pop().replace('.json', '');
                embeddings.examples[profileName] = {
                    conversation: {},
                    coding: {}
                };

                // Embed conversation examples
                if (profile.conversation_examples && Array.isArray(profile.conversation_examples)) {
                    console.log(`      🗣️  Embedding ${profile.conversation_examples.length} conversation examples...`);
                    
                    for (let i = 0; i < profile.conversation_examples.length; i++) {
                        const example = profile.conversation_examples[i];
                        const exampleText = extractExampleText(example);
                        const embedding = await embeddingModel.embed(exampleText);
                        
                        embeddings.examples[profileName].conversation[i] = embedding;
                        
                        if ((i + 1) % 5 === 0) {
                            process.stdout.write(`\r      🗣️  ${i + 1}/${profile.conversation_examples.length}`);
                        }
                    }
                    console.log(`\r      ✅ ${profile.conversation_examples.length} conversation examples embedded`);
                }

                // Embed coding examples
                if (profile.coding_examples && Array.isArray(profile.coding_examples)) {
                    console.log(`      💻 Embedding ${profile.coding_examples.length} coding examples...`);
                    
                    for (let i = 0; i < profile.coding_examples.length; i++) {
                        const example = profile.coding_examples[i];
                        const exampleText = extractExampleText(example);
                        const embedding = await embeddingModel.embed(exampleText);
                        
                        embeddings.examples[profileName].coding[i] = embedding;
                        
                        if ((i + 1) % 5 === 0) {
                            process.stdout.write(`\r      💻 ${i + 1}/${profile.coding_examples.length}`);
                        }
                    }
                    console.log(`\r      ✅ ${profile.coding_examples.length} coding examples embedded`);
                }

            } catch (error) {
                console.error(`   ❌ Error processing ${profilePath}:`, error.message);
            }
        }

        // Embed skill docs
        console.log('\n🛠️  Embedding skill documentation...');
        const skillDocs = getSkillDocs();
        
        console.log(`   📝 Found ${skillDocs.length} skill docs`);
        
        for (let i = 0; i < skillDocs.length; i++) {
            const doc = skillDocs[i];
            const skillName = extractSkillName(doc);
            const embedding = await embeddingModel.embed(doc.substring(0, 200)); // Use first 200 chars
            
            embeddings.skills[skillName] = embedding;
            
            if ((i + 1) % 10 === 0) {
                process.stdout.write(`\r   🛠️  ${i + 1}/${skillDocs.length}`);
            }
        }
        console.log(`\r   ✅ ${skillDocs.length} skill docs embedded`);

        // Save embeddings
        console.log('\n💾 Saving embeddings...');
        writeFileSync(EMBEDDINGS_FILE, JSON.stringify(embeddings, null, 2));
        console.log(`   ✅ Saved to: ${EMBEDDINGS_FILE}`);

        // Print summary
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('📊 SUMMARY');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`✅ Examples: ${Object.keys(embeddings.examples).length} profiles`);
        console.log(`✅ Skills: ${Object.keys(embeddings.skills).length} skills`);
        console.log(`✅ Total embeddings: ${countEmbeddings(embeddings)}`);
        console.log(`✅ File size: ${(Buffer.byteLength(JSON.stringify(embeddings)) / 1024 / 1024).toFixed(2)}MB`);
        console.log('═══════════════════════════════════════════════════════════════\n');

        return embeddings;

    } catch (error) {
        console.error('❌ Error generating embeddings:', error);
        process.exit(1);
    }
}

function extractExampleText(example) {
    if (Array.isArray(example)) {
        return example
            .filter(turn => turn.role !== 'assistant')
            .map(turn => turn.content)
            .join(' ');
    }
    return String(example);
}

function extractSkillName(doc) {
    const match = doc.match(/skills\.([\w_]+)/);
    return match ? match[1] : 'unknown';
}

function countEmbeddings(embeddings) {
    let count = 0;
    for (const profile of Object.values(embeddings.examples)) {
        count += Object.keys(profile.conversation).length;
        count += Object.keys(profile.coding).length;
    }
    count += Object.keys(embeddings.skills).length;
    return count;
}

// Run
generateEmbeddings().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});