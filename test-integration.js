const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// We need to use TS node or just require the built file
const { CompressorService } = require('./dist/services/compressor.js');

async function testIntegration() {
    const compressor = new CompressorService();

    const baseName = 'test-service-random';
    const outputPath = `C:\\Users\\MBVRK\\iCompressor-App\\${baseName}.zip`;
    const dummySrc = `C:\\Users\\MBVRK\\iCompressor-App\\dummy-service.bin`;

    if (!fs.existsSync(dummySrc)) {
        console.log('Generating random file...');
        fs.writeFileSync(dummySrc, crypto.randomBytes(1024 * 1024 * 3)); // 3MB
    }

    // Clean up old files
    const outDir = path.dirname(outputPath);
    fs.readdirSync(outDir).forEach(f => {
        if (f.startsWith(baseName)) {
            try { fs.unlinkSync(path.join(outDir, f)); } catch (e) { }
        }
    });

    console.log('Testing compress...');
    const compResult = await compressor.compress({
        sources: [dummySrc],
        outputPath,
        format: 'zip',
        level: 5,
        splitVolumeSize: '1m'
    });

    console.log('Compress result:', compResult);

    console.log('Output files:');
    const outFiles = fs.readdirSync(outDir).filter(f => f.startsWith(baseName));
    console.log(outFiles);

    if (!outFiles.includes(`${baseName}.001.zip`)) {
        console.error('Rename failed! Did not find .001.zip');
        return;
    }

    console.log('Testing extract...');
    const extractDir = path.join(outDir, 'extract-service-test');
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir);

    const extractResult = await compressor.extract({
        archivePath: path.join(outDir, `${baseName}.001.zip`),
        outputDir: extractDir
    });

    console.log('Extract result:', extractResult);
    console.log('Extracted files:', fs.readdirSync(extractDir));

    console.log('Testing listArchive...');
    const listResult = await compressor.listArchive(path.join(outDir, `${baseName}.001.zip`));
    console.log('List result files:', listResult.files.map(f => f.name));
}

testIntegration().catch(console.error);
