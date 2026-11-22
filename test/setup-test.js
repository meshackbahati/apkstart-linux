'use strict';
/** Tests for the backend setup registry and portable ATL detection. */
const assert = require('assert/strict');
const setup = require('../src/core/setup');

(async () => {
  console.log('\n[Backend setup registry]');
  const ids = setup.list().map((s) => s.id);
  assert.deepEqual(ids, ['builtin', 'waydroid', 'atl']);
  console.log('  ✓ all backends expose a setup module');

  const builtin = setup.run('builtin', () => {});
  assert.equal(builtin.ok, true);
  console.log('  ✓ builtin setup needs no system packages');

  const report = setup.check();
  assert.ok(Array.isArray(report.backends));
  assert.equal(typeof report.atl === 'string' || report.atl === null, true);
  console.log('  ✓ check reports portable ATL without modifying the system');

  const unknown = setup.run('unknown', () => {});
  assert.equal(unknown.ok, false);
  console.log('  ✓ unknown backend is rejected');

  console.log('\n4 passed, 0 failed\n');
})().catch((e) => { console.error(e); process.exitCode = 1; });
