import path from 'path';
import { fileURLToPath } from 'url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));