'use strict';
/**
 * Consistency guard for the version strings that appear in more than one file.
 *
 * package.json is the only source of truth. Documentation, release notes and
 * store package names are derived from it manually, so a version bump can
 * leave stale text behind. This check runs in CI and fails before a release
 * is published rather than after an asset has been uploaded.
 *
 * Usage: node tools/check-pins.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const pkg = JSON.parse(read('package.json'));
const version = String(pkg.version || '').trim();
const errors = [];

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  errors.push(`package.json has an invalid version: ${version || '(empty)'}`);
}

const spec = read('docs/SPECIFICATIONS.md');
const specMatch = /version (\d+\.\d+\.\d+)/.exec(spec);
if (!specMatch) {
  errors.push('docs/SPECIFICATIONS.md does not state the current version');
} else if (specMatch[1] !== version) {
  errors.push(`docs/SPECIFICATIONS.md says ${specMatch[1]}, package.json says ${version}`);
}

const notes = `.github/release-notes-v${version}.md`;
if (!fs.existsSync(path.join(ROOT, notes))) {
  errors.push(`missing release notes for the current version: ${notes}`);
}

const four = `${version}.0`;
for (const file of ['docs/store-listing.md', 'docs/store-msix.md', 'docs/store-upload-walkthrough.md']) {
  if (!read(file).includes(`ApkStart_${four}_x64.msix`)) {
    errors.push(`${file} does not reference ApkStart_${four}_x64.msix`);
  }
}

if (errors.length) {
  console.error('Version pin check failed:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Version pins agree at ${version}`);
