const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const ENGINE_FILES = [
  'dist/engine/engine.js',
  'dist/engine/constants.js',
  'dist/engine/types.js',
  'dist/engine/properties.js',
  'dist/engine/findings.js',
  'dist/scoring/mapper.js',
  'dist/scoring/severity-scorer.js',
];

for (const file of ENGINE_FILES) {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) {
    console.warn(`SKIP (not found): ${file}`);
    continue;
  }

  const original = fs.readFileSync(fullPath, 'utf8');

  const result = esbuild.transformSync(original, {
    minify: true,
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,
    target: 'node20',
    format: 'esm',
    keepNames: false,
  });

  fs.writeFileSync(fullPath, result.code);
  const pct = ((1 - result.code.length / original.length) * 100).toFixed(0);
  console.log(
    `MINIFIED: ${file} (${original.length} → ${result.code.length} bytes, -${pct}%)`
  );
}

// Remove source maps for engine files
for (const file of ENGINE_FILES) {
  const mapPath = path.resolve(file + '.map');
  if (fs.existsSync(mapPath)) {
    fs.unlinkSync(mapPath);
    console.log(`REMOVED SOURCE MAP: ${file}.map`);
  }
}
