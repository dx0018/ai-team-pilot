'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function listTests(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(function (name) { return name.endsWith('.test.js'); })
    .sort()
    .map(function (name) { return path.join(dir, name); });
}

const root = path.join(__dirname, '..');
const files = listTests(path.join(root, 'tests', 'unit'))
  .concat(listTests(path.join(root, 'tests', 'e2e')));

if (files.length === 0) {
  console.error('No unit tests found in tests/unit');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test'].concat(files), { stdio: 'inherit' });
process.exit(result.status == null ? 1 : result.status);
