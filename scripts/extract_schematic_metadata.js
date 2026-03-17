import fs from 'fs';
import zlib from 'zlib';
import { parse } from 'prismarine-nbt';

async function extractMetadataSchem(filePath) {
  return new Promise((resolve, reject) => {
    //console.log(`📂 Reading: ${filePath}`);
    
    fs.readFile(filePath, async (err, data) => {
      if (err) return reject(err);
      
      const isGzipped = data[0] === 0x1f && data[1] === 0x8b;
      
      try {
        const buffer = isGzipped 
          ? await new Promise((res, rej) => zlib.gunzip(data, (e, d) => e ? rej(e) : res(d)))
          : data;
        
        const { parsed } = await parse(buffer);
        //console.log('✅ NBT parsed');
        //console.log('Parsed:', JSON.stringify(parsed, null, 2).substring(0, 500));

        // The actual data is in parsed.value
        const root = parsed.value.Schematic.value;
        //console.log('Root keys:', Object.keys(root));
        const created = root.Metadata?.value?.Date?.value;
        const createdTimestamp = created ? (created[0] * 4294967296 + created[1]) : null;

        //console.log('Metadata contents:', JSON.stringify(root.Metadata?.value, null, 2).substring(0, 800));

        const metadata = {
        width: root.Width?.value || null,
        height: root.Height?.value || null,
        length: root.Length?.value || null,
        description: root.Metadata?.value?.Description?.value || filePath.split('/').pop().split('.')[0],
        author: root.Metadata?.value?.Author?.value || null,
        created: createdTimestamp,
        perimeter: root.Width?.value && root.Length?.value ? (root.Width.value + root.Length.value) * 2 : null
        };


        
        resolve(metadata);
      } catch (e) {
        reject(e);
      }
    });
  });
}


async function extractMetadataSchematic(filePath) {
  return new Promise((resolve, reject) => {
    //console.log(`📂 Reading: ${filePath}`);
    
    fs.readFile(filePath, async (err, data) => {
      if (err) return reject(err);
      
      const isGzipped = data[0] === 0x1f && data[1] === 0x8b;
      
      try {
        const buffer = isGzipped 
          ? await new Promise((res, rej) => zlib.gunzip(data, (e, d) => e ? rej(e) : res(d)))
          : data;
        
        const { parsed } = await parse(buffer);
        const root = parsed.value;
        
        // .schematic format: dimensions at root level
        const metadata = {
          width: root.Width?.value || null,
          height: root.Height?.value || null,
          length: root.Length?.value || null,
          description: root.Description?.value || filePath.split('/').pop().split('.')[0],
          author: root.Author?.value || null,
          created: root.Date?.value || null,
          perimeter: root.Width?.value && root.Length?.value ? (root.Width.value + root.Length.value) * 2 : null
        };
        
        resolve(metadata);
      } catch (e) {
        reject(e);
      }
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2];
  const ext = filePath.split('.').pop().toLowerCase();
  
  const extractFn = ext === 'schem' ? extractMetadataSchem : extractMetadataSchematic;
  
  extractFn(filePath)
    .then(m => console.log(JSON.stringify(m)))
    .catch(e => {
      console.error(JSON.stringify({ error: e.message }));
      process.exit(1);
    });
}

export { extractMetadataSchem, extractMetadataSchematic };