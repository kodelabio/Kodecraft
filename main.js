import { loadConfig } from './config/loader.js';
import { KodecraftManager } from './core/KodecraftManager.js';

const config = await loadConfig();
await KodecraftManager.init(config);