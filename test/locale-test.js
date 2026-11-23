'use strict';
/** Default guest language is English on the Linux build. */
const assert = require('assert/strict');
const store = require('../src/core/store');
const { Runtime } = require('../src/core/engine');

(async () => {
  console.log('\n[Guest locale]');
  assert.equal(store.DEFAULT_SETTINGS.engine.locale, 'en-US');
  assert.equal(store.DEFAULT_SETTINGS.engine.chineseIme, false);
  console.log('  ✓ defaults use English and do not install the Chinese IME');

  const rt = new Runtime('/app');
  const calls = [];
  const client = {
    shell: async (cmd) => { calls.push(cmd); return 'en-US'; },
  };
  await rt._ensureSystemLocale(client, 'en-US');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /settings get system system_locales/);
  console.log('  ✓ an already-English guest is left untouched');

  console.log('\n2 passed, 0 failed\n');
})().catch((e) => { console.error(e); process.exitCode = 1; });
