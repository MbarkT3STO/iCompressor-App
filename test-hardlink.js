const Seven = require('node-7z');
const sevenBin = require('7zip-bin');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

async function testHardlinkRename() {
    const baseName = 'test-hardlink';
    const outputPath = `C:\\Users\\MBVRK\\iCompressor-App\\${baseName}.zip`;
    const dummySrc = `C:\\Users\\MBVRK\\iCompressor-App\\dummy-hardlink.bin`;

    if (!fs.existsSync(dummySrc)) {
        fs.writeFileSync(dummySrc, crypto.randomBytes(1024 * 1024 * 3)); // 3MB
    }

    const options = {
        $bin: sevenBin.path7za,
        $raw: ['-v1m']
    };

    const stream = Seven.add(outputPath, dummySrc, options);
    await new Promise((resolve) => { stream.on('end', resolve); });

    // Rename to .001.zip
    const outDir = 'C:\\Users\\MBVRK\\iCompressor-App';
    const files = fs.readdirSync(outDir).filter(f => f.startsWith(`${baseName}.zip.00`));
    const renamedFiles = [];
    for (const f of files) {
        const match = f.match(/(.*)\.zip\.(\d{3,})$/);
        if (match) {
            const newName = `${match[1]}.${match[2]}.zip`;
            fs.renameSync(path.join(outDir, f), path.join(outDir, newName));
            renamedFiles.push(newName);
        }
    }

    // Now emulate extraction via hardlinks
    const tempExtractDir = path.join(outDir, 'temp-hardlink-extract');
    if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
    fs.mkdirSync(tempExtractDir);

    // Link .001.zip -> temp/test-hardlink.zip.001
    for (const rf of renamedFiles) {
        const match = rf.match(/(.*)\.(\d{3,})\.zip$/);
        if (match) {
            const original7zName = `${match[1]}.zip.${match[2]}`;
            fs.linkSync(path.join(outDir, rf), path.join(tempExtractDir, original7zName));
        }
    }

    // Extract from the linked .zip.001
    const extractToDir = path.join(outDir, 'extract-hardlink-done');
    if (fs.existsSync(extractToDir)) fs.rmSync(extractToDir, { recursive: true, force: true });
    fs.mkdirSync(extractToDir);

    console.log('Extracting from hardlink...');
    const extractStream = Seven.extract(path.join(tempExtractDir, `${baseName}.zip.001`), extractToDir, { $bin: sevenBin.path7za });

    try {
        await new Promise((resolve, reject) => {
            extractStream.on('end', resolve);
            extractStream.on('error', reject);
        });
        console.log('Extraction success! Files:', fs.readdirSync(extractToDir));
    } catch (err) {
        console.error('Extraction failed via hardlink:', err);
    }
}

testHardlinkRename().catch(console.error);
