'use strict';
// Copies the shared building blocks into every option so each folder is self-contained.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const shared = __dirname;
const copies = [
  ['http.js', 'src/lib/http.js'],
  ['token.js', 'src/lib/token.js'],
  ['demoAuth.js', 'src/lib/demoAuth.js'],
  ['client.js', 'public/client.js'],
  ['base.css', 'public/base.css'],
  ['testServer.js', 'test/helpers.js'],
];

for (const dir of fs.readdirSync(root)) {
  if (!dir.startsWith('option-')) continue;
  for (const [from, to] of copies) {
    const dest = path.join(root, dir, to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(shared, from), dest);
  }
  console.log(`synced ${dir}`);
}
