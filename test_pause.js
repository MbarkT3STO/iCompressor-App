const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const script = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class ProcessControl {
    [DllImport("ntdll.dll")]
    public static extern int NtSuspendProcess(IntPtr processHandle);
}
"@
Add-Type -TypeDefinition $code
Write-Host "C# code compiled successfully"
`;

const tempFile = path.join(os.tmpdir(), "test_suspend.ps1");
fs.writeFileSync(tempFile, script, 'utf8');

try {
    console.log("Running:", tempFile);
    const out = execSync(`powershell -ExecutionPolicy Bypass -File "${tempFile}"`);
    console.log("Output:", out.toString());
} catch (e) {
    console.error("Error:", e.message);
    if (e.stdout) console.error("STDOUT:", e.stdout.toString());
    if (e.stderr) console.error("STDERR:", e.stderr.toString());
}
