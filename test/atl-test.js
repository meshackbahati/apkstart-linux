'use strict';
/**
 * ATL backend tests with an injected command runner and spawner.
 * Run: node test/atl-test.js
 */
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AtlBackend, parseSize, sdkFor } = require('../src/core/backends/atl');
const backends = require('../src/core/backends');

const TMP = path.join(os.tmpdir(), 'apkstart-atl-test.apk');
const ATL_DIR = path.join(os.tmpdir(), 'apkstart-atl-fixture');
const SPLIT = path.join(os.tmpdir(), 'apkstart-atl-split.apk');
fs.writeFileSync(TMP, 'apk');
fs.writeFileSync(SPLIT, 'split');
fs.rmSync(ATL_DIR, { recursive: true, force: true });
fs.mkdirSync(ATL_DIR, { recursive: true });

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

function make(overrides = {}, appOverrides = {}) {
  const calls = [];
  const children = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    if (String(args).includes('command -v')) return { ok: true, stdout: '/usr/bin/android-translation-layer\n', stderr: '' };
    return { ok: true, stdout: '', stderr: '' };
  };
  const spawner = (cmd, args, opts) => {
    const child = { pid: 4242, on() {}, unref() {}, killed: false };
    children.push({ cmd, args, child, env: opts && opts.env });
    return child;
  };
  const store = {
    getApp: () => Object.assign({
      apkPath: TMP, activity: 'org.fdroid.IconActivity',
    }, appOverrides),
    getSettings: () => ({ atl: {} }),
  };
  return {
    backend: new AtlBackend('/app', Object.assign({
      run, spawn: spawner, store, atlDir: ATL_DIR, cacerts: '',
    }, overrides)),
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

  await test('launchApp exposes a stable <pkg>.apk operand and window options', async () => {
    const { backend, children } = make();
    await backend.ensure();
    const r = await backend.launchApp('org.fdroid.fdroid');
    assert.equal(r.ok, true);
    assert.equal(children[0].cmd, '/usr/bin/android-translation-layer');
    const stable = path.join(ATL_DIR, 'launch', 'org.fdroid.fdroid.apk');
    assert.equal(children[0].args[0], stable);
    assert.equal(fs.readlinkSync(stable), TMP);
    assert.deepEqual(children[0].args.slice(1), [
      '-w', '1200', '-h', '850',
      '--gapplication-app-id', 'com.apkstart.org.fdroid.fdroid',
      '-l', 'org/fdroid/IconActivity',
    ]);
    assert.equal(r.dataDir, path.join(ATL_DIR, 'data', 'org.fdroid.fdroid'));
  });

  await test('per-app settings control size, SDK, touch and denied permissions', async () => {
    const { backend, children } = make();
    const settings = { atl: { 'org.fdroid.fdroid': {
      size: '900x1600', sdk: 99, mouseAsTouch: true,
      deniedPermissions: ['android.permission.CAMERA'], titlebar: 'atl',
    } } };
    backend.deps.store.getSettings = () => settings;
    await backend.ensure();
    await backend.launchApp('org.fdroid.fdroid');
    const args = children[0].args;
    assert.ok(args.includes('900') && args.includes('1600'), args.join(' '));
    assert.ok(args.includes('--sdk-int') && args.includes('36'), args.join(' '));
    const env = children[0].env;
    assert.equal(env.ATL_MOUSE_AS_TOUCH, '1');
    assert.equal(env.ATL_DENIED_PERMISSIONS, 'android.permission.CAMERA');
    assert.equal(env.ATL_TITLEBAR, 'atl');
    assert.ok(env.ATL_NAVIGATION_TOOLTIPS.includes('Back'));
  });

  await test('split parts are passed after the base APK', async () => {
    const { backend, children } = make({}, { splits: [SPLIT] });
    await backend.ensure();
    await backend.launchApp('org.fdroid.fdroid');
    assert.equal(children[0].args[1], SPLIT);
  });

  await test('clearData removes only the app data directory', async () => {
    const { backend } = make();
    const dir = path.join(ATL_DIR, 'data', 'org.fdroid.fdroid');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'marker'), 'data');
    const r = await backend.clearData('org.fdroid.fdroid');
    assert.equal(r.ok, true);
    assert.equal(fs.existsSync(dir), false);
  });

  await test('parseSize clamps to the supported window range', () => {
    assert.deepEqual(parseSize('900x1600'), [900, 1600]);
    assert.deepEqual(parseSize('50x50'), [1200, 850]);
    assert.deepEqual(parseSize('garbage'), [1200, 850]);
  });

  await test('sdkFor respects minSdk and clamps overrides', () => {
    assert.equal(sdkFor({ targetSdk: 30, minSdk: 24 }), 30);
    assert.equal(sdkFor({ targetSdk: 21, minSdk: 28 }), 28);
    assert.equal(sdkFor({ targetSdk: 40 }), 36);
    assert.equal(sdkFor({}, 99), 36);
    assert.equal(sdkFor({}, 10), 21);
    assert.equal(sdkFor({}), null);
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

  await test('portable prefix is under ApkStart data and is used in the environment', async () => {
    const { backend } = make();
    const root = backend.portableRoot();
    assert.ok(root.endsWith(path.join('apkstart', 'runtime', 'atl')), root);
    const env = backend._env();
    assert.ok(env.LD_LIBRARY_PATH.includes(path.join(root, 'lib')));
  });

  await test('client reports a launched app as alive for installer polling', async () => {
    const { backend } = make();
    await backend.ensure();
    await backend.launchApp('org.fdroid.fdroid');
    assert.equal((await backend.client().shell('pidof org.fdroid.fdroid')).trim(), '1');
    assert.equal((await backend.client().shell('pidof other.package')).trim(), '');
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
  fs.unlinkSync(SPLIT);
  if (failed) process.exitCode = 1;
})();
