'use strict';
/**
 * Linux 「点 APK 即用」链路的纯 Node 测试：文件关联、默认内存策略、原生窗口接管。
 * 不依赖桌面环境、不拉起模拟器。
 *
 * 运行：node test/linux-usage-test.js
 */
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// 必须在 require assoc / store 之前设定，二者在模块加载期就解析数据目录
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'apkstart-linux-usage-'));
process.env.APPDATA = path.join(TMP, 'appdata');
process.env.XDG_DATA_HOME = path.join(TMP, 'xdg-data');
process.env.XDG_CONFIG_HOME = path.join(TMP, 'xdg-config');
fs.mkdirSync(path.join(TMP, 'no-tools'), { recursive: true });

const assoc = require('../src/core/assoc');
const store = require('../src/core/store');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

(async () => {
  console.log('\n[Linux 使用体验：.apk 文件关联]');

  await test('APK 处理器 .desktop 带 MIME 声明与 %f 占位符', () => {
    const body = assoc.linuxDesktopEntry({
      target: '/opt/ApkStart/ApkStart',
      args: '"/opt/ApkStart/app"',
      icon: '/opt/ApkStart/logo.png',
    });
    assert.ok(body.startsWith('[Desktop Entry]'));
    assert.ok(body.includes(`MimeType=${assoc.LINUX_MIME};`));
    assert.ok(body.includes('Exec="/opt/ApkStart/ApkStart" "/opt/ApkStart/app" %f'));
    assert.ok(body.includes('Icon=/opt/ApkStart/logo.png'));
    assert.ok(body.includes('NoDisplay=true'));
  });

  await test('Exec 里的 % 被转义，但 %f 字段码保持原样', () => {
    const body = assoc.linuxDesktopEntry({ target: '/tmp/100%App', args: '', icon: '' });
    assert.ok(body.includes('Exec="/tmp/100%%App" %f'));
  });

  await test('写 mimeapps.list 时保留其它段落并读出原默认值', () => {
    const file = path.join(TMP, 'mimeapps.list');
    fs.writeFileSync(file, [
      '[Added Associations]',
      'image/png=viewer.desktop;',
      '',
      '[Default Applications]',
      `${assoc.LINUX_MIME}=old-player.desktop`,
      'text/plain=editor.desktop',
      '',
    ].join('\n'));
    assert.equal(assoc.mimeDefaultIn(fs.readFileSync(file, 'utf8')), 'old-player.desktop');
    const prev = assoc.linuxWriteMimeDefault(file, assoc.LINUX_DESKTOP_ID);
    assert.equal(prev, 'old-player.desktop');
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.includes(`${assoc.LINUX_MIME}=${assoc.LINUX_DESKTOP_ID}`));
    assert.ok(text.includes('text/plain=editor.desktop'), '不能覆盖其它 MIME');
    assert.ok(text.includes('image/png=viewer.desktop;'), '不能覆盖其它段落');
  });

  await test('注册/查询/取消关联会还原原来的默认程序', () => {
    const oldPath = process.env.PATH;
    process.env.PATH = path.join(TMP, 'no-tools'); // 逼实现走 mimeapps.list 兜底
    try {
      const configDir = path.join(TMP, 'xdg-config');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'mimeapps.list'), [
        '[Default Applications]',
        `${assoc.LINUX_MIME}=old-player.desktop`,
        '',
      ].join('\n'));

      const r = assoc.registerAssociation('/opt/ApkStart/ApkStart', path.join(TMP, 'logo.png'), '');
      assert.equal(r.ok, true);
      assert.equal(r.previous, 'old-player.desktop');
      assert.ok(fs.existsSync(path.join(TMP, 'xdg-data', 'applications', assoc.LINUX_DESKTOP_ID)));
      assert.equal(assoc.associationStatus().registered, true);

      const u = assoc.unregisterAssociation();
      assert.equal(u.restored, 'old-player.desktop');
      assert.equal(assoc.associationStatus().registered, false);
      assert.equal(
        assoc.mimeDefaultIn(fs.readFileSync(path.join(configDir, 'mimeapps.list'), 'utf8')),
        'old-player.desktop',
      );
    } finally {
      process.env.PATH = oldPath;
    }
  });

  console.log('\n[Linux 使用体验：默认内存与窗口策略]');

  await test('Linux 默认不预热，空闲 5 分钟回收，原生窗口', () => {
    const s = store.getSettings();
    assert.equal(s.engine.prewarm, false);
    assert.equal(s.engine.idleShutdownMinutes, 5);
    assert.equal(s.engine.resourceMode, 'save');
    assert.equal(s.display.windowEmbed, false);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
})();
