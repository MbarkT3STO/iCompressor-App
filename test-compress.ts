import { CompressorService } from './src/services/compressor';
import * as path from 'path';
import * as fs from 'fs';

async function run() {
  const compressor = new CompressorService();
  const testDir = path.join(__dirname, 'test-output');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
  
  const targetFile = __filename;
  const outputPath = path.join(testDir, 'test.zip');
  
  console.log('Compressing...');
  const result = await compressor.compress({
    sources: [targetFile],
    outputPath,
    format: 'zip',
    level: 6,
    password: 'testpassword'
  });
  
  console.log('Result:', result);
}

run().catch(console.error);
