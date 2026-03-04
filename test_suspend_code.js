const Seven = require('node-7z');
const sevenBin = require('7zip-bin');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

const pathTo7z = sevenBin.path7za;
const dummyDir = path.join(os.homedir(), "iCompressor-App", "node_modules");

console.log("Starting 7za...");
const stream = Seven.add('test_archive.7z', dummyDir, { $bin: pathTo7z, $progress: true });

stream.on('progress', (p) => {
    console.log("Progress:", p.percent);
});

setTimeout(() => {
    console.log("Suspending...");
    const script = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class ProcessControl {
    [DllImport("ntdll.dll")]
    public static extern int NtSuspendProcess(IntPtr processHandle);
}
"@
Add-Type -TypeDefinition $code -ErrorAction Stop
$ps = Get-Process 7za -ErrorAction Stop
foreach ($p in $ps) {
    if ($p) {
        $result = [ProcessControl]::NtSuspendProcess($p.Handle)
        Write-Host "Suspend Result for PID $($p.Id): $result"
    }
}
  `;
    const tempFile = path.join(os.tmpdir(), "test_suspend_2.ps1");
    fs.writeFileSync(tempFile, script, 'utf8');
    try {
        const out = execSync(`powershell -ExecutionPolicy Bypass -File "${tempFile}"`);
        console.log("Powershell output:", out.toString());
    } catch (e) {
        console.error("Powershell Error:", e.message);
        if (e.stdout) console.error("STDOUT:", e.stdout.toString());
        if (e.stderr) console.error("STDERR:", e.stderr.toString());
    }

    setTimeout(() => {
        console.log("Killing process...");
        try { execSync(`taskkill /F /IM 7za.exe`); } catch (e) { }
        process.exit(0);
    }, 2000);
}, 2000);
