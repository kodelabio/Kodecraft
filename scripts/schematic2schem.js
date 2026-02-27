import { readFile, writeFile } from "fs/promises";
import schematic2schem from "schematic2schem";



export async function convertSchematicToSchem(inputPath, outputPath) {
    try {
        console.log(`📂 Reading: ${inputPath}`);
        const data = await readFile(inputPath);
        
        console.log(`🔄 Converting to .schem format...`);
        const schemBuffer = await schematic2schem.default(data);
        
        await writeFile(outputPath, schemBuffer);
        console.log(`✅ Converted: ${outputPath}`);
        
        return outputPath;
    } catch (err) {
        console.error(`❌ Conversion error:`, err.message);
        throw err;
    }
}

// CLI usage
const [, , inputPath, outputPath] = process.argv;

if (!inputPath) {
    console.error('Usage: node schematic2schem.js <input.schematic> [output.schem]');
    process.exit(1);
}

const outPath = outputPath || inputPath.replace('.schematic', '.schem');
convertSchematicToSchem(inputPath, outPath).catch(() => process.exit(1));