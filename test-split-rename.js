const Seven = require('node-7z');
const sevenBin = require('7zip-bin');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

async function testSplitRename() {
    const baseName = 'test-rename-random';
    const outputPath = `C:\\Users\\MBVRK\\iCompressor-App\\${baseName}.zip`;
    const dummySrc = `C:\\Users\\MBVRK\\iCompressor-App\\dummy-random.bin`;

    if (!fs.existsSync(dummySrc)) {
        console.log('Generating random file...');
        fs.writeFileSync(dummySrc, crypto.randomBytes(1024 * 1024 * 5)); // 5MB random data
    }

    const options = {
        $bin: sevenBin.path7za,
        $raw: ['-v1m']
    };

    console.log('Compressing...');
    const stream = Seven.add(outputPath, dummySrc, options);

    await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
    });

    console.log('Compression done. Renaming files...');

    // Find generated files
    const files = fs.readdirSync(__dirname).filter(f => f.startsWith(baseName + '.zip.00'));
    for (const f of files) {
        // e.g. test-rename-random.zip.001 -> test-rename-random.001.zip
        const match = f.match(/(.*)\.zip\.(\d{3,})$/);
        if (match) {
            const newName = `${match[1]}.${match[2]}.zip`;
            fs.renameSync(f, newName);
            console.log(`Renamed ${f} to ${newName}`);
        }
    }

    console.log('Testing extraction...');
    // Extract from the .001.zip file
    const extractDir = `C:\\Users\\MBVRK\\iCompressor-App\\extract-test-random`;
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir);

    const extractOptions = {
        $bin: sevenBin.path7za
    };

    const extractStream = Seven.extract(`C:\\Users\\MBVRK\\iCompressor-App\\${baseName}.001.zip`, extractDir, extractOptions);

    try {
        await new Promise((resolve, reject) => {
            extractStream.on('end', resolve);
            extractStream.on('error', reject);
        });
        console.log('Extraction done.');
        const extractedFiles = fs.readdirSync(extractDir);
        console.log('Extracted files:', extractedFiles);
    } catch (err) {
        console.error('Extraction failed:', err);
    }
}

testSplitRename().catch(console.error);
