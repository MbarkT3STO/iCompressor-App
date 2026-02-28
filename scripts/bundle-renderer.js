const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: [path.join(__dirname, '../src/renderer/scripts/events.ts')],
  bundle: true,
  format: 'iife',
  outfile: path.join(__dirname, '../dist/renderer/scripts/app.js'),
  platform: 'browser',
  target: ['es2020'],
  minify: false,
}).catch(() => process.exit(1));
