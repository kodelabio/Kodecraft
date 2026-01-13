// src/process/init_agent.js
// Wrapper that delegates to mindcraft's init_agent.js

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../../');

// Import and run mindcraft's init_agent
const mindcraftInitPath = resolve(projectRoot, 'mindcraft/src/process/init_agent.js');
const { default: initAgent } = await import(mindcraftInitPath);

// Run the initialization
await initAgent();