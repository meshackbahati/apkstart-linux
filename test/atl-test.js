'use strict';
/**
 * ATL backend tests with an injected command runner and spawner.
 * Run: node test/atl-test.js
 */
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AtlBackend } = require('../src/core/backends/atl');
const backends = require('../src/core/backends');

const TMP = path.join(os.tmpdir(), 'apkstart-atl-test.apk');
fs.writeFileSync(TMP, 'apk');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

function make(overrides = {}) {
  const calls = [];
  const children = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    if (String(args).includes('command -v')) return { ok: true, stdout: '/usr/bin/android-translation-layer\n', stderr: '' };
    return { ok: true, stdout: '', stderr: '' };
  };
  const spawner = (cmd, args) => {
    const child = { pid: 4242, on() {}, unref() {}, killed: false };
    children.push({ cmd, args, child });
    return child;
  };
  const store = {
    getApp: () => ({ apkPath: TMP, activity: 'org.fdroid.IconActivity' }),
  };
  return {
    backend: new AtlBackend('/app', Object.assign({ run, spawn: spawner, store }, overrides)),
    calls, children,
  };
}

(async () => {
  console.log('\n[ATL backend]');

  await test('probe finds the ATL binary on PATH', async () => {
    const { backend } = make();
    const p = await backend.probe();
    assert.equal(p.found, true);
    assert.equal(p.path, '/usr/bin/android-translation-layer');
  });

  await test('check reports a missing ATL installation', async () => {
    const { backend } = make({ run: () => ({ ok: true, stdout: '', stderr: '' }) });
    const c = await backend.check();
    assert.equal(c.ok, false);
    assert.equal(c.needs, 'atl');
  });

  await test('ensure returns a client without adb', async () => {
    const { backend } = make();
    const r = await backend.ensure();
    assert.equal(r.ok, true);
    assert.equal(r.noAdb, true);
    assert.equal(r.backend, 'atl');
    assert.equal(typeof r.client.shell, 'function');
  });

  await test('launchApp uses the cached APK and a slash-separated activity', async () => {
    const { backend, children } = make();
    await backend.ensure();
    const r = await backend.launchApp('org.fdroid.fdroid');
    assert.equal(r.ok, true);
    assert.equal(children[0].cmd, '/usr/bin/android-translation-layer');
    assert.equal(children[0].args[0], TMP);
    assert.deepEqual(children[0].args.slice(1), ['-l', 'org/fdroid/IconActivity']);
  });

  await test('stopApp kills the tracked process', async () => {
    const { backend } = make();
    await backend.ensure();
    await backend.launchApp('org.fdroid.fdroid');
    let signalled = 0;
    const original = process.kill;
    process.kill = () => { signalled++; return true; };
    try { await backend.stopApp('org.fdroid.fdroid'); } finally { process.kill = original; }
    assert.equal(signalled, 1);
    assert.deepEqual(backend.running(), []);
  });

  console.log('\n[Backend registry]');

  await test('ATL is registered alongside builtin and Waydroid', () => {
    const ids = backends.describe().map((d) => d.id);
    assert.deepEqual(ids, ['builtin', 'waydroid', 'atl']);
    const made = backends.create({
      appRoot: '/app', settings: { runtime: { backend: 'atl' } }, store: {}, log: () => {},
    });
    assert.equal(made.id, 'atl');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  fs.unlinkSync(TMP);
  if (failed) process.exitCode = 1;
})();
