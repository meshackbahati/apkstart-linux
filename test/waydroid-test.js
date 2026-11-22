'use strict';
/**
 * Waydroid backend tests with an injected command runner. No Waydroid required.
 * Run: node test/waydroid-test.js
 */
const assert = require('assert/strict');
const { WaydroidBackend, SERIAL } = require('../src/core/backends/waydroid');
const backends = require('../src/core/backends');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

function makeBackend(overrides = {}) {
  const calls = [];
  const replies = Object.assign({
    'command -v waydroid': { ok: true, stdout: '/usr/bin/waydroid\n', stderr: '' },
    'waydroid status': { ok: true, stdout: 'State: RUNNING\n', stderr: '' },
    'waydroid adb connect': { ok: true, stdout: 'Established ADB connection\n', stderr: '' },
    'adb connect': { ok: true, stdout: `connected to ${SERIAL}\n`, stderr: '' },
    'adb devices': { ok: true, stdout: `List of devices attached\n192.168.240.112:5555\tdevice\n`, stderr: '' },
  }, overrides.replies || {});
  const run = (cmd, args = [], opts = {}) => {
    calls.push([cmd, ...args].join(' '));
    const key = Object.keys(replies).find((k) => [cmd, ...args].join(' ').includes(k));
    return key ? replies[key] : { ok: true, stdout: '', stderr: '' };
  };
  return { backend: new WaydroidBackend('/app', { run, adbPath: '/usr/bin/adb' }), calls };
}

(async () => {
  console.log('\n[Waydroid backend]');

  await test('probe reports Waydroid found on PATH', async () => {
    const { backend } = makeBackend();
    const r = await backend.probe();
    assert.equal(r.found, true);
    assert.equal(r.path, '/usr/bin/waydroid');
  });

  await test('check requires a running container', async () => {
    const { backend } = makeBackend({ replies: { 'waydroid status': { ok: false, stdout: 'State: STOPPED', stderr: '' } } });
    const r = await backend.check();
    assert.equal(r.ok, false);
    assert.equal(r.needs, 'session');
  });

  await test('ensure starts the session when needed and connects adb', async () => {
    const { backend, calls } = makeBackend({
      replies: { 'waydroid status': { ok: false, stdout: 'State: STOPPED', stderr: '' } },
    });
    const r = await backend.ensure();
    assert.equal(r.ok, true);
    assert.equal(r.serial, '192.168.240.112:5555');
    assert.equal(r.adbPath, '/usr/bin/adb');
    assert.ok(calls.some((c) => c === 'waydroid session start'));
    assert.ok(calls.some((c) => c.includes('adb connect')));
    assert.equal(backend.running(), true);
  });

  await test('stop leaves a pre-existing session untouched', async () => {
    const { backend } = makeBackend();
    await backend.ensure();
    const r = await backend.stop();
    assert.equal(r.ok, true);
    assert.ok(/left the user/.test(r.note));
  });

  await test('stop shuts down a session we started', async () => {
    const { backend, calls } = makeBackend({
      replies: { 'waydroid status': { ok: false, stdout: 'STOPPED', stderr: '' } },
    });
    await backend.ensure();
    await backend.stop();
    assert.ok(calls.includes('waydroid session stop'));
  });

  await test('launchApp rejects unsafe package names', async () => {
    const { backend } = makeBackend();
    const r = await backend.launchApp('bad;pkg');
    assert.equal(r.ok, false);
  });

  console.log('\n[Backend registry]');

  await test('explicit selection returns Waydroid, default stays builtin', () => {
    const explicit = backends.create({
      appRoot: '/app', settings: { runtime: { backend: 'waydroid' } }, store: {}, log: () => {},
    });
    assert.equal(explicit.id, 'waydroid');
    const normal = backends.create({ appRoot: '/app', settings: {}, store: {}, log: () => {} });
    assert.equal(normal.id, 'builtin');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
})();
