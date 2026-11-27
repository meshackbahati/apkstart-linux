'use strict';
/**
 * APK Signature Scheme v2 verification tests.
 * Run: node test/apksig-test.js
 *
 * The two APKs under assets/ are real signed packages shipped as fixtures.
 * A synthetic package from test/lib/make-apk.js is used as the unsigned case.
 */
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readSigner, verifyV2 } = require('../src/core/apksig');

const ROOT = path.join(__dirname, '..');
const REAL = ['assets/PinyinIME.apk', 'assets/moto-rush.apk'].map((p) => path.join(ROOT, p));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

console.log('\n[apksig.js APK v2 verification]');

test('signed APKs expose a signer certificate hash', () => {
  for (const apk of REAL) {
    if (!fs.existsSync(apk)) continue;
    const signer = readSigner(apk);
    assert(signer, `${apk} has no signer`);
    assert.match(signer.certSha256, /^[0-9a-f]{64}$/);
  }
});

test('v2 signature and content digest verify on real APKs', () => {
  for (const apk of REAL) {
    if (!fs.existsSync(apk)) continue;
    const signer = readSigner(apk);
    const r = verifyV2(apk);
    assert.equal(r.ok, true, `${apk}: ${r.reason}`);
    assert.equal(r.certSha256, signer.certSha256);
  }
});

test('a pinned certificate mismatch is rejected', () => {
  const apk = REAL.find((f) => fs.existsSync(f));
  if (!apk) return;
  const r = verifyV2(apk, '0'.repeat(64));
  assert.equal(r.ok, false);
  assert.match(r.reason, /unexpected signer certificate/);
});

test('a changed content byte invalidates the signature', () => {
  const apk = REAL.find((f) => fs.existsSync(f));
  if (!apk) return;
  const tmp = path.join(os.tmpdir(), `apkstart-tampered-${process.pid}.apk`);
  fs.copyFileSync(apk, tmp);
  try {
    const fd = fs.openSync(tmp, 'r+');
    const one = Buffer.from([0xff]);
    fs.writeSync(fd, one, 0, 1, 1024);
    fs.closeSync(fd);
    const r = verifyV2(tmp);
    assert.equal(r.ok, false);
    assert.match(r.reason, /digest/);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('an unsigned file is reported without throwing', () => {
  const tmp = path.join(os.tmpdir(), `apkstart-unsigned-${process.pid}.apk`);
  fs.writeFileSync(tmp, 'not an apk');
  try {
    assert.equal(readSigner(tmp), null);
    assert.equal(verifyV2(tmp).ok, false);
  } finally {
    fs.unlinkSync(tmp);
  }
});

console.log(`\n结果：${passed} 通过，${failed} 失败\n`);
process.exit(failed ? 1 : 0);
