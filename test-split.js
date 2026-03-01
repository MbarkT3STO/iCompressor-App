const Seven = require('node-7z');
const sevenBin = require('7zip-bin');
const path = require('path');
const fs = require('fs');

async function testSplit() {
    const outputPath = 'C:\\Users\\MBVRK\\iCompressor-App\\test-split.zip';
    // create dummy big file
    const dummySrc = 'C:\\Users\\MBVRK\\iCompressor-App\\dummy.txt';
    fs.writeFileSync(dummySrc, 'A'.repeat(1024 * 1024 * 5)); // 5MB

    const options = {
        $bin: sevenBin.path7za,
        $raw: ['-v1m']
    };

    console.log('Compressing...');
    const stream = Seven.add(outputPath, dummySrc, options);
    stream.on('end', () => {
        console.log('Done.');
        console.log('Files created:');
        fs.readdirSync(__dirname).forEach(file => {
            if (file.includes('test-split')) {
                console.log(file);
            }
        });
    });
    stream.on('error', (err) => {
        console.error('Error:', err);
    });
}

testSplit();
