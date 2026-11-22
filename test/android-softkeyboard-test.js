'use strict';
/**
 * Tests for the on-screen keyboard preference.
 * Run: node test/android-softkeyboard-test.js
 */
const assert = require('assert/strict');
const { AndroidSettings } = require('../src/core/android');
const store = require('../src/core/store');

(async () => {
  console.log('\n[Android soft keyboard]');
  let commands = [];
  const client = {
    shell: async (script) => { commands.push(script); return ''; },
  };
  const android = new AndroidSettings({ ensure: async () => ({ ok: true, client }) });

  commands = [];
  await android.setSoftKeyboard(false);
  assert.match(commands[0], /settings put secure show_ime_with_hard_keyboard 0/);
  console.log('  ✓ disabling writes show_ime_with_hard_keyboard=0');

  commands = [];
  await android.setSoftKeyboard(true);
  assert.match(commands[0], /settings put secure show_ime_with_hard_keyboard 1/);
  console.log('  ✓ enabling writes show_ime_with_hard_keyboard=1');

  const client2 = {
    shell: async () => 'softkb=1\nwifi=1\n',
  };
  const android2 = new AndroidSettings({ ensure: async () => ({ ok: true, client: client2 }) });
  const status = await android2.status();
  assert.equal(status.softKeyboard, true);
  console.log('  ✓ status reports the current guest value');

  const client3 = {
    shell: async () => 'softkb=0\nwifi=1\n',
  };
  const android3 = new AndroidSettings({ ensure: async () => ({ ok: true, client: client3 }) });
  assert.equal((await android3.status()).softKeyboard, false);
  console.log('  ✓ status reports the keyboard as off');

  assert.equal(store.DEFAULT_SETTINGS.input.virtualKeyboard, false);
  console.log('  ✓ laptop keyboard is the default');

  console.log('\n5 passed, 0 failed\n');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
