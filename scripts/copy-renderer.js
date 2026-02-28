const fs = require('fs');
const path = require('path');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((f) => {
      copyRecursive(path.join(src, f), path.join(dest, f));
    });
  } else if (!src.endsWith('.ts') && !src.endsWith('.tsx')) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

const src = path.join(__dirname, '../src/renderer');
const dest = path.join(__dirname, '../dist/renderer');
fs.mkdirSync(dest, { recursive: true });
copyRecursive(src, dest);
