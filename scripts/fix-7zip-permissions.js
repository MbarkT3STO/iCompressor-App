/**
 * Fix 7zip-bin executable permissions (npm sometimes strips execute bit)
 */
const fs = require('fs');
const path = require('path');

const sevenBin = path.join(__dirname, '../node_modules/7zip-bin');
if (!fs.existsSync(sevenBin)) return;

function chmodRecursive(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      chmodRecursive(full);
    } else if (e.isFile() && e.name.match(/^7za(\.exe)?$/i)) {
      try {
        fs.chmodSync(full, 0o755);
      } catch (_) {}
    }
  }
}

chmodRecursive(sevenBin);
