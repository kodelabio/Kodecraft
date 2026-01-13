import path from 'path';
import { fileURLToPath } from 'url';

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../'  // Go up 2 levels from src/config to project root
);