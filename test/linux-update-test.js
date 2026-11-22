'use strict';
/**
 * Linux 自动更新路径的纯 Node 测试：AppImage 资产选择与 POSIX 替换脚本。
 * 不联网、不真的替换程序。
 *
 * 运行：node test/linux-update-test.js
 */
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'apkstart-linux-update-'));
process.env.APPDATA = path.join(TMP, 'appdata');
const { Updater } = require('../src/core/updater');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

function makeUpdater() {
  const u = new Updater({
    currentVersion: '0.6.2',
    exePath: '/opt/ApkStart/ApkStart',
    isPackaged: true,
    dataDir: path.join(TMP, 'data'),
  });
  u.sources.latest = async () => ({
    version: '0.6.3', tag: 'v0.6.3', name: 'v0.6.3', notes: '', htmlUrl: 'https://example.com',
    assets: [
      { name: 'ApkStart-v0.6.3-win64-portable.zip', url: 'https://example.com/w.zip', size: 100 },
      { name: 'ApkStart-0.6.3-linux-x64.AppImage', url: 'https://example.com/a.AppImage', size: 100 },
    ],
    sources: [], unreachable: [],
  });
  return u;
}

(async () => {
  console.log('\n[Linux 更新：资产选择]');

  await test('Linux 上选 AppImage，而不是 Windows 便携包', async () => {
    const u = makeUpdater();
    const info = await u.check();
    assert.equal(info.asset.name, 'ApkStart-0.6.3-linux-x64.AppImage');
    assert.equal(info.canAutoApply, true);
  });

  await test('没有 AppImage 时只给发布页入口', async () => {
    const u = makeUpdater();
    u.sources.latest = async () => ({
      version: '0.6.3', tag: 'v0.6.3', name: 'v0.6.3', notes: '', htmlUrl: 'https://example.com',
      assets: [{ name: 'ApkStart-v0.6.3-win64-portable.zip', url: 'https://example.com/w.zip', size: 1 }],
      sources: [], unreachable: [],
    });
    const info = await u.check();
    assert.equal(info.asset, null);
    assert.equal(info.canAutoApply, false);
  });

  console.log('\n[Linux 更新：替换脚本]');

  await test('生成的脚本是 POSIX shell，替换 APPIMAGE 指向的文件并重启', async () => {
    const u = makeUpdater();
    const oldEnv = process.env.APPIMAGE;
    process.env.APPIMAGE = '/opt/ApkStart/ApkStart-0.6.2.AppImage';
    try {
      const script = u.apply(
        { mode: 'appimage', payload: path.join(TMP, 'new.AppImage'), version: '0.6.3' },
        { waitPid: 999999, spawn: false },
      );
      assert.ok(script.startsWith('#!/bin/sh'));
      assert.ok(script.includes("TARGET='/opt/ApkStart/ApkStart-0.6.2.AppImage'"));
      assert.ok(script.includes('mv -f "$TMP" "$TARGET"'));
      assert.ok(script.includes('nohup "$TARGET"'));
      assert.ok(script.includes('kill -0 "$pid"'));
      assert.ok(!/powershell|\.ps1/i.test(script));
    } finally {
      if (oldEnv === undefined) delete process.env.APPIMAGE;
      else process.env.APPIMAGE = oldEnv;
    }
  });

  await test('启动时能找回上次已下载但未替换的 AppImage', () => {
    const u = makeUpdater();
    const dir = path.join(u.updateDir, '0.6.3');
    fs.mkdirSync(dir, { recursive: true });
    const image = path.join(dir, 'ApkStart-0.6.3-linux-x64.AppImage');
    fs.writeFileSync(image, Buffer.alloc(33 * 1024 * 1024, 7));
    const job = u.findResumableJob();
    assert.ok(job);
    assert.equal(job.mode, 'appimage');
    assert.equal(job.payload, image);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
})();
