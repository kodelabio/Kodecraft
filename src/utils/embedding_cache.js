/**
 * src/utils/embedding_cache.js
 * Load pre-generated embeddings from file
 */

import { readFileSync, existsSync } from 'fs';

const EMBEDDINGS_FILE = './data/embeddings/embeddings.json';

let cachedEmbeddings = null;

export function loadEmbeddings() {
    if (cachedEmbeddings) {
        console.log('[EmbeddingCache] Using in-memory cache');
        return cachedEmbeddings;
    }

    if (!existsSync(EMBEDDINGS_FILE)) {
        console.warn(`[EmbeddingCache] ⚠️  Embeddings file not found: ${EMBEDDINGS_FILE}`);
        console.warn('[EmbeddingCache] Run: node scripts/generate-embeddings.js');
        return null;
    }

    try {
        const data = readFileSync(EMBEDDINGS_FILE, 'utf8');
        cachedEmbeddings = JSON.parse(data);
        console.log('[EmbeddingCache] ✅ Loaded embeddings from file');
        console.log(`[EmbeddingCache]    Timestamp: ${cachedEmbeddings.timestamp}`);
        console.log(`[EmbeddingCache]    Profiles: ${Object.keys(cachedEmbeddings.examples).length}`);
        console.log(`[EmbeddingCache]    Skills: ${Object.keys(cachedEmbeddings.skills).length}`);
        return cachedEmbeddings;
    } catch (error) {
        console.error('[EmbeddingCache] ❌ Error loading embeddings:', error.message);
        return null;
    }
}

export function getExampleEmbeddings(profileName, exampleType) {
    if (!cachedEmbeddings) {
        loadEmbeddings();
    }

    if (!cachedEmbeddings?.examples?.[profileName]?.[exampleType]) {
        return null;
    }

    return cachedEmbeddings.examples[profileName][exampleType];
}

export function getSkillEmbeddings() {
    if (!cachedEmbeddings) {
        loadEmbeddings();
    }

    return cachedEmbeddings?.skills || {};
}

export function getEmbeddingsTimestamp() {
    if (!cachedEmbeddings) {
        loadEmbeddings();
    }

    return cachedEmbeddings?.timestamp || null;
}