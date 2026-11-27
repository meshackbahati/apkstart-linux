'use strict';
/**
 * ATL compatibility checker tests: pure verdicts plus the bundled APK fixtures.
 * Run: node test/atlcompat-test.js
 */
const assert = require('assert/strict');
const path = require('path');
const c = require('../src/core/atlcompat');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

console.log('\n[ATL compatibility]');

test('ARM-only native code is blocked on an x86_64 host', () => {
  const r = c.assess({ names: ['lib/arm64-v8a/libgame.so', 'classes.dex'], arch: 'x64' });
  assert.equal(r.verdict, 'blocked');
  assert.deepEqual(r.abis, ['arm64-v8a']);
  assert.equal(r.issues[0].id, 'abi');
});

test('an APK that ships the host ABI is not blocked', () => {
  const r = c.assess({ names: ['lib/arm64-v8a/a.so', 'lib/x86_64/a.so'], arch: 'x64' });
  assert.equal(r.verdict, 'likely');
});

test('pure Java/Kotlin apps have no ABI issue on any host', () => {
  assert.equal(c.assess({ names: ['classes.dex'], arch: 'arm64' }).verdict, 'likely');
});

test('Play services in dex bytes makes the app risky', () => {
  const dex = Buffer.from('....Lcom/google/android/gms/common/GoogleApiAvailability;....');
  const r = c.assess({ names: ['classes.dex'], blobs: [dex], arch: 'x64' });
  assert.equal(r.verdict, 'risky');
  assert.ok(r.issues.some((i) => i.id === 'play-services'));
});

test('UTF-16 strings in the binary manifest are found too', () => {
  const manifest = Buffer.from('Lcom/google/firebase/messaging/', 'utf16le');
  const r = c.assess({ names: ['AndroidManifest.xml'], blobs: [manifest], arch: 'x64' });
  assert.ok(r.issues.some((i) => i.id === 'firebase-messaging'));
});

test('MediaDrm is informational and does not change the verdict', () => {
  const r = c.assess({ names: ['classes.dex'], blobs: [Buffer.from('Landroid/media/MediaDrm;')], arch: 'x64' });
  assert.equal(r.verdict, 'likely');
  assert.equal(r.issues[0].severity, 'info');
});

test('game engines are flagged once each', () => {
  const r = c.assess({ names: ['lib/x86_64/libunity.so', 'lib/arm64-v8a/libunity.so', 'lib/x86_64/libflutter.so'], arch: 'x64' });
  assert.equal(r.issues.filter((i) => i.id === 'unity').length, 1);
  assert.ok(r.issues.some((i) => i.id === 'flutter'));
  assert.equal(r.verdict, 'risky');
});

test('unreadable files give verdict unknown instead of throwing', () => {
  const r = c.checkApk(path.join(__dirname, 'does-not-exist.apk'));
  assert.equal(r.verdict, 'unknown');
  assert.ok(r.error);
});

test('bundled fixtures: PinyinIME has every ABI and no blockers', () => {
  const r = c.checkApk(path.join(__dirname, '..', 'assets', 'PinyinIME.apk'), { arch: 'x64' });
  assert.equal(r.verdict, 'likely');
  assert.ok(r.abis.includes('x86_64'));
});

test('bundled fixtures: Moto Rush ships x86_64 and uses Play services', () => {
  const r = c.checkApk(path.join(__dirname, '..', 'assets', 'moto-rush.apk'), { arch: 'x64' });
  assert.deepEqual(r.abis, ['x86_64']);
  assert.equal(r.verdict, 'risky');
  assert.equal(c.checkApk(path.join(__dirname, '..', 'assets', 'moto-rush.apk'), { arch: 'arm64' }).verdict, 'blocked');
});

test('describe gives one heading and one line per issue', () => {
  const text = c.describe(c.assess({ names: ['lib/armeabi-v7a/x.so'], arch: 'x64' }));
  assert.match(text, /cannot run on this computer/);
  assert.equal(text.split(/\r?\n/).length, 2);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exitCode = 1;
