'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'tests', 'unit');
const files = fs.readdirSync(dir)
  .filter(function (name) { return name.endsWith('.test.js'); })
  .sort()
  .map(function (name) { return path.join(dir, name); });

if (files.length === 0) {
  console.error('No unit tests found in tests/unit');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test'].concat(files), { stdio: 'inherit' });
process.exit(result.status == null ? 1 : result.status);
