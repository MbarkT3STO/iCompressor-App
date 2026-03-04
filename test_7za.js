const Seven = require('node-7z');
const sevenBin = require('7zip-bin');
const path = require('path');
const os = require('os');

const pathTo7z = sevenBin.path7za;
const options = {
    $bin: pathTo7z,
    $progress: true,
};

console.log("Starting 7za...");
console.log("Binary path:", pathTo7z);

const dummyDir = path.join(os.homedir(), "iCompressor-App", "node_modules");
const stream = Seven.add('test_archive.7z', dummyDir, options);

stream.on('progress', (p) => {
    console.log("Progress:", p.percent);
});

stream.on('end', () => console.log('End!'));
stream.on('error', (err) => console.log('Error!', err));

setTimeout(() => {
    console.log("PID:", stream.info?.pid || stream._childProcess?.pid || stream.pid);
    const { execSync } = require('child_process');
    try {
        const out = execSync(`powershell -Command "Get-Process"`);
        const lines = out.toString().split('\\n').filter(l => l.includes('7z'));
        console.log("Processes found:", lines);
    } catch (e) { console.log(e); }

    console.log("Suspending now...");
    stream.pause(); // does this do anything?
    setTimeout(() => {
        console.log("Killing...");
        execSync(`taskkill /F /PID ${stream.info?.pid || stream._childProcess?.pid || stream.pid}`);
    }, 2000);
}, 2000);
