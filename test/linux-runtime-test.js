'use strict';
/**
 * Linux 运行时接线的纯 Node 测试：不联网、不解压、不拉起模拟器。
 *
 * 这里锁住的是「Windows 二进制名不漏到 Linux 路径里」这一类移植回归：
 * 漏一处就表现为组件明明装好了，spawn 时却报 ENOENT / EACCES。
 *
 * 运行：node test/linux-runtime-test.js
 */
const assert = require('assert/strict');
const path = require('path');
const platform = require('../src/core/platform');
const { Provisioner } = require('../src/core/provision');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

(async () => {
  console.log('\n[Linux 运行时：数据目录]');

  await test('未设置 APPDATA 时，Linux 使用 XDG 数据目录', () => {
    const { execFileSync } = require('child_process');
    const root = path.join(__dirname, '..');
    const env = { ...process.env, XDG_DATA_HOME: '/tmp/apkstart-xdg', APPDATA: '' };
    delete env.APPDATA;
    const out = execFileSync(process.execPath, [
      '-e', `process.stdout.write(require(${JSON.stringify(path.join(root, 'src/core/store.js'))}).DATA_DIR)`,
    ], { env, encoding: 'utf8' });
    assert.equal(out, '/tmp/apkstart-xdg/apkstart');
  });

  console.log('\n[Linux 运行时：二进制名与下载地址]');

  await test('Linux 不带 .exe，Windows 保留 .exe', () => {
    assert.equal(platform.bin('adb', 'linux'), 'adb');
    assert.equal(platform.bin('emulator', 'linux'), 'emulator');
    assert.equal(platform.bin('qemu-img', 'linux'), 'qemu-img');
    assert.equal(platform.bin('adb', 'win32'), 'adb.exe');
    assert.equal(platform.bin('emulator', 'win32'), 'emulator.exe');
  });

  await test('platform-tools / emulator 的官方包按平台挑选', () => {
    assert.ok(/platform-tools-latest-linux\.zip$/.test(platform.adbZipUrl('linux')));
    assert.ok(/platform-tools-latest-windows\.zip$/.test(platform.adbZipUrl('win32')));
    assert.ok(/emulator-linux_x64-.*\.zip$/.test(platform.emulatorFallbackUrl('linux')));
    assert.ok(/emulator-windows_x64-.*\.zip$/.test(platform.emulatorFallbackUrl('win32')));
    assert.ok(platform.emulatorUrlMatch('linux').test('emulator-linux_x64-16970787.zip'));
    assert.ok(!platform.emulatorUrlMatch('linux').test('emulator-windows_x64-16847572.zip'));
    assert.ok(platform.emulatorUrlMatch('win32').test('emulator-windows_x64-16847572.zip'));
    assert.ok(platform.runtimePackPattern('linux').test('ApkStart-runtime-linux-0.6.2.zip'));
    assert.ok(!platform.runtimePackPattern('linux').test('ApkStart-runtime-0.6.2.zip'));
    assert.ok(platform.runtimePackPattern('win32').test('ApkStart-runtime-0.6.2.zip'));
  });

  await test('ZIP 解压时会给 Linux 可执行文件补执行位', () => {
    assert.equal(platform.unixExecutableEntry('emulator/emulator'), true);
    assert.equal(platform.unixExecutableEntry('emulator/qemu-img'), true);
    assert.equal(platform.unixExecutableEntry('platform-tools/adb'), true);
    assert.equal(platform.unixExecutableEntry('emulator/netsimd'), true);
    assert.equal(platform.unixExecutableEntry('emulator/nimble_bridge'), true);
    assert.equal(platform.unixExecutableEntry('emulator/bin64/resize2fs'), true);
    assert.equal(platform.unixExecutableEntry('emulator/lib64/libGL.so'), false);
    assert.equal(platform.unixExecutableEntry('system.img'), false);
  });

  console.log('\n[Linux 运行时：KVM 加速]');

  await test('KVM 可用时识别为 kvm 加速', () => {
    const r = platform.accelFromLinuxCheck('Accel info:\n  kvm:  Available\n  accel: 0', { kvm: true });
    assert.equal(r.ok, true);
    assert.equal(r.kind, 'kvm');
  });

  await test('输出里没有 kvm 时，即使 /dev/kvm 存在也不能谎报成功', () => {
    const r = platform.accelFromLinuxCheck('accel: 0', { kvm: false });
    assert.equal(r.ok, false);
    assert.equal(r.viaTcg, true);
    assert.ok(/BIOS/.test(r.note));
  });

  await test('设备存在但权限不足时给出加入 kvm 组的提示', () => {
    const r = platform.accelFromLinuxCheck('KVM is not available', { kvm: true });
    assert.equal(r.ok, false);
    assert.ok(/kvm 组/.test(r.note), r.note);
  });

  console.log('\n[Linux 运行时：路径接线]');

  const prov = new Provisioner(path.join(__dirname, '..'));
  const p = prov.paths();
  await test('运行时路径使用本平台的可执行文件名', () => {
    assert.equal(path.basename(p.adbExe), platform.bin('adb'));
    assert.equal(path.basename(p.emulatorExe), platform.bin('emulator'));
    assert.equal(path.basename(p.qemuImg), platform.bin('qemu-img'));
  });

  await test('hypervisor() 在 Linux 上报告 kvm 字段', async () => {
    const hv = await prov.hypervisor();
    assert.equal(typeof hv.kvm, 'boolean');
    assert.ok(hv.note);
  });

  await test('Linux 下不再下载 Windows 版 QEMU 安装包', async () => {
    let message = '';
    try { await prov.installQemu(); } catch (e) { message = e.message; }
    assert.ok(/apt install qemu-system-x86/.test(message), message);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
})();
