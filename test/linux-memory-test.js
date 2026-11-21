'use strict';
/**
 * Linux 低内存配额的纯 Node 测试：注入宿主画像，不碰真机、不启动模拟器。
 *
 * 这一层锁住两条约定：自动参数在 Linux 上必须收敛到 2GB / 2 核；
 * 用户手动填写的内存与核心数必须仍然优先。前者省内存，后者保证高级用户不被策略绑架。
 *
 * 运行：node test/linux-memory-test.js
 */
const assert = require('assert/strict');
const doctor = require('../src/core/doctor');
const { clampMemoryMB, clampCores } = require('../src/core/resources');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

const linuxHost = (over = {}) => ({
  platform: 'linux', arch: 'x64', totalMB: 16384, freeMB: 8192, cores: 16,
  home: '/home/user', homeAscii: true, tmp: '/tmp', ...over,
});
const winHost = (over = {}) => ({
  platform: 'win32', arch: 'x64', totalMB: 16384, freeMB: 8192, cores: 16,
  home: 'C:\\Users\\user', homeAscii: true, tmp: 'C:\\Temp', ...over,
});

(() => {
  console.log('\n[Linux QEMU 低内存配额]');

  test('16GB Linux 宿主：自动内存收敛到 2048MB，核心收敛到 2', () => {
    const p = doctor.autoProfile({ host: linuxHost(), accel: { ok: true }, settings: {} });
    assert.equal(p.memoryMB, 2048, `实际 ${p.memoryMB}`);
    assert.equal(p.cores, 2, `实际 ${p.cores}`);
    assert.equal(p.heapMB, 256);
    assert.equal(p.linuxTuned, true);
  });

  test('同一台机器是 Windows 时参数不变（3072MB / 4 核）', () => {
    const p = doctor.autoProfile({ host: winHost(), accel: { ok: true }, settings: {} });
    assert.equal(p.memoryMB, 3072, `实际 ${p.memoryMB}`);
    assert.equal(p.cores, 4, `实际 ${p.cores}`);
    assert.equal(p.linuxTuned, false);
  });

  test('Linux 上手动内存与核心数优先，不被自动配额覆盖', () => {
    const settings = { engine: { autoMemory: false, memoryMB: 3072, cores: 3 } };
    const p = doctor.autoProfile({ host: linuxHost(), accel: { ok: true }, settings });
    assert.equal(p.memoryMB, 3072, `实际 ${p.memoryMB}`);
    assert.equal(p.cores, 3, `实际 ${p.cores}`);
    assert.equal(p.linuxTuned, false);
  });

  test('小内存 Linux 宿主（4GB / 4 核）不会低于运行下限', () => {
    const p = doctor.autoProfile({
      host: linuxHost({ totalMB: 4096, freeMB: 2048, cores: 4 }), accel: { ok: false }, settings: {},
    });
    assert.equal(p.memoryMB, 2048);
    assert.equal(p.cores, 2);
  });

  test('降级重试矩阵在 Linux 配额下仍然完整且不重复空转', () => {
    const p = doctor.autoProfile({ host: linuxHost(), accel: { ok: false }, settings: {} });
    const variants = doctor.planVariants(p);
    assert.ok(variants.length >= 2);
    assert.ok(variants.every((v) => v.memoryMB >= 2048 && v.cores >= 2));
    assert.equal(variants[variants.length - 1].lastResort, true);
  });

  test('设置页摘要会标明 Linux 低内存策略已生效', () => {
    const p = doctor.autoProfile({ host: linuxHost(), accel: { ok: true }, settings: {} });
    assert.ok(/Linux 低内存/.test(doctor.describeProfile(p)), doctor.describeProfile(p));
  });

  test('裸 QEMU 兜底路径在 Linux 上默认 2GB / 2 核，Windows 维持 4GB / 4 核', () => {
    assert.deepEqual(doctor.rawQemuBudget({ platform: 'linux' }), { memoryMB: 2048, cores: 2 });
    assert.deepEqual(doctor.rawQemuBudget({ platform: 'win32' }), { memoryMB: 4096, cores: 4 });
    assert.deepEqual(
      doctor.rawQemuBudget({ platform: 'linux', memoryMB: 3072, cores: 4 }),
      { memoryMB: 3072, cores: 4 },
    );
  });

  test('Linux 上资源上限的提示文案不再误称 Windows', () => {
    assert.ok(/Linux 宿主/.test(clampMemoryMB(64 * 1024, 32768, 'linux').reason));
    assert.ok(/Linux 宿主/.test(clampCores(16, 16, 'linux').reason));
    assert.ok(/Windows/.test(clampMemoryMB(64 * 1024, 32768).reason));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
})();
