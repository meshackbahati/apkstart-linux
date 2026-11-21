'use strict';
/**
 * .apk 文件关联。
 *
 * Windows：只写 HKCU，不需要管理员权限；双击 apk → apkstart.exe "%1"。
 * Linux：freedesktop 的 MIME 关联 —— 写一个 .desktop 处理器，再用 xdg-mime
 * （缺失时直接改 mimeapps.list）把它设为 application/vnd.android.package-archive
 * 的默认程序。两条路径都记住关联前的默认值，取消关联时原样还回去。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const store = require('./store');

const PROGID = 'ApkStart.apk';
const EXT = '.apk';
const CLASSES = 'HKCU\\Software\\Classes';
// 关联前的「原默认程序」记在这里，卸载时原样还回去，别把用户的关联弄丢
const STORE_KEY = 'HKCU\\Software\\ApkStart';
const PREV_VALUE = 'assocPrev';

// ---- Linux / freedesktop ----
const LINUX_MIME = 'application/vnd.android.package-archive';
const LINUX_DESKTOP_ID = 'apkstart-apk.desktop';
const LINUX_PREV_FILE = 'linux-assoc-prev.json';

function reg(args) {
  try {
    execFileSync('reg', args, { windowsHide: true, stdio: 'pipe' });
    return true;
  } catch (_) {
    return false;
  }
}

/** 读某个键的默认值（REG_SZ），读不到返回空串 */
function regDefault(key) {
  try {
    const out = execFileSync('reg', ['query', key, '/ve'], { windowsHide: true, encoding: 'utf8' });
    const line = String(out).split(/\r?\n/).find((l) => /REG_SZ/i.test(l));
    const m = line && /REG_SZ\s+(.*)$/i.exec(line);
    return m ? m[1].trim() : '';
  } catch (_) {
    return '';
  }
}

/** 读我们记下的「关联前默认值」 */
function readPrev() {
  try {
    const out = execFileSync('reg', ['query', STORE_KEY, '/v', PREV_VALUE], { windowsHide: true, encoding: 'utf8' });
    const m = /REG_SZ\s+(.*)$/im.exec(String(out));
    return m ? m[1].trim() : '';
  } catch (_) {
    return '';
  }
}

function notifyShell() {
  const ps = `
$sig = '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int eventId, int flags, IntPtr item1, IntPtr item2);';
try {
  $t = Add-Type -MemberDefinition $sig -Name 'ShNotify' -Namespace 'ApkStart' -PassThru -ErrorAction Stop;
  $t::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero);
} catch {}
`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      windowsHide: true, stdio: 'pipe', timeout: 8000,
    });
  } catch (_) { /* 通知失败不影响关联本身 */ }
}

/** .desktop 里的 Exec 值：路径加引号，% 是字段码必须转义成 %% */
function desktopQuote(s) {
  return `"${String(s).replace(/(["\\$`])/g, '\\$1').replace(/%/g, '%%')}"`;
}

/**
 * 生成 Linux 的 APK 处理器 .desktop 内容。纯函数，便于在没有桌面的 CI 上验证。
 * 末尾的 %f 是 .desktop 规范里的「本地文件路径」字段码，故意不转义。
 */
function linuxDesktopEntry({ target = '', args = '', icon = '' } = {}) {
  const argv = String(args || '').match(/"[^"]*"|\S+/g) || [];
  const execLine = [
    desktopQuote(target),
    ...argv.map((a) => desktopQuote(a.replace(/^"|"$/g, ''))),
    '%f',
  ].join(' ');
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=Install APK with ApkStart',
    `Exec=${execLine}`,
    icon ? `Icon=${icon}` : '',
    `MimeType=${LINUX_MIME};`,
    'NoDisplay=true',
    'Terminal=false',
    '',
  ].filter((l) => l !== '').join('\n');
}

function linuxPaths() {
  const data = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const config = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return {
    desktop: path.join(data, 'applications', LINUX_DESKTOP_ID),
    mimeapps: path.join(config, 'mimeapps.list'),
    prev: path.join(store.DATA_DIR, LINUX_PREV_FILE),
  };
}

/** 读当前 .apk 默认处理器；优先 xdg-mime，缺失时读 mimeapps.list */
function linuxCurrentDefault() {
  try {
    const out = execFileSync('xdg-mime', ['query', 'default', LINUX_MIME], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    });
    const v = String(out).trim();
    if (v && v !== 'plain-text.desktop') return v;
  } catch (_) { /* 没有 xdg-mime 就退回文件 */ }
  const file = linuxPaths().mimeapps;
  try {
    return mimeDefaultIn(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return '';
  }
}

/** 从 mimeapps.list 文本里读出某个 MIME 的默认值（纯函数） */
function mimeDefaultIn(text, mime = LINUX_MIME) {
  const lines = String(text || '').split(/\r?\n/);
  let inSection = false;
  const esc = mime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const line of lines) {
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) inSection = /^\s*\[Default Applications\]\s*$/.test(line);
    if (!inSection) continue;
    const m = new RegExp(`^\\s*${esc}\\s*=\\s*(.+)$`).exec(line);
    if (m) return m[1].trim();
  }
  return '';
}

/**
 * 直接改 mimeapps.list（xdg-mime 不存在时的兜底）。返回改之前的默认值。
 * 保留文件里其它段落和其它 MIME 的设置，只替换 [Default Applications] 里的这一行。
 */
function linuxWriteMimeDefault(file, desktopId) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { /* 文件本来就不存在 */ }
  const previous = mimeDefaultIn(text);
  const lines = String(text).split(/\r?\n/);
  const esc = LINUX_MIME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lineRe = new RegExp(`^\\s*${esc}\\s*=`);
  let section = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*\[Default Applications\]\s*$/.test(lines[i])) section = i;
    else if (section >= 0 && /^\s*\[[^\]]+\]\s*$/.test(lines[i])) { end = i; break; }
  }
  if (section < 0) {
    lines.push('', '[Default Applications]', `${LINUX_MIME}=${desktopId}`);
  } else {
    let replaced = false;
    for (let i = section + 1; i < end; i += 1) {
      if (lineRe.test(lines[i])) { lines[i] = `${LINUX_MIME}=${desktopId}`; replaced = true; break; }
    }
    if (!replaced) lines.splice(end, 0, `${LINUX_MIME}=${desktopId}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n').replace(/\n+$/, '\n'), 'utf8');
  return previous;
}

function linuxRecordPrev(previous) {
  try {
    fs.mkdirSync(path.dirname(linuxPaths().prev), { recursive: true });
    fs.writeFileSync(linuxPaths().prev, JSON.stringify({ previous }), 'utf8');
  } catch (_) { /* ignore */ }
}

function linuxReadRecordedPrev() {
  try { return JSON.parse(fs.readFileSync(linuxPaths().prev, 'utf8')).previous || ''; } catch (_) { return ''; }
}

function linuxSetDefault(desktopId) {
  try {
    execFileSync('xdg-mime', ['default', desktopId, LINUX_MIME], {
      stdio: 'ignore', timeout: 5000,
    });
    return true;
  } catch (_) {
    try { linuxWriteMimeDefault(linuxPaths().mimeapps, desktopId); return true; } catch (__) { return false; }
  }
}

function linuxRefresh() {
  try {
    execFileSync('update-desktop-database', [path.dirname(linuxPaths().desktop)], {
      stdio: 'ignore', timeout: 5000,
    });
  } catch (_) { /* 桌面环境不要求这一步 */ }
}

/**
 * @param {string} exePath apkstart 主程序路径（开发模式下是 electron 可执行文件）
 * @param {string} [iconPath] 图标。Windows 用 ico，Linux 用 png
 * @param {string} [extraArgs] 开发模式下需要先传应用目录
 */
function registerAssociation(exePath, iconPath, extraArgs) {
  if (process.platform === 'linux') {
    const paths = linuxPaths();
    const previous = linuxCurrentDefault();
    fs.mkdirSync(path.dirname(paths.desktop), { recursive: true });
    fs.writeFileSync(paths.desktop, linuxDesktopEntry({
      target: exePath,
      args: extraArgs,
      icon: iconPath || '',
    }), { encoding: 'utf8', mode: 0o644 });
    linuxRecordPrev(previous);
    const ok = linuxSetDefault(LINUX_DESKTOP_ID);
    linuxRefresh();
    return { ok, progId: LINUX_DESKTOP_ID, previous };
  }

  const icon = iconPath || exePath;
  const command = `"${exePath}" ${extraArgs ? extraArgs + ' ' : ''}"%1"`;

  // 记住关联前 .apk 的默认程序：用户本来装了别的安卓工具时，卸载 ApkStart
  // 之后应该还给他，而不是把 .apk 变成「没有默认程序」。
  const prev = regDefault(`${CLASSES}\\${EXT}`);
  if (prev && prev !== PROGID) {
    reg(['add', STORE_KEY, '/v', PREV_VALUE, '/d', prev, '/f']);
  } else if (!prev) {
    try { execFileSync('reg', ['delete', STORE_KEY, '/v', PREV_VALUE, '/f'], { windowsHide: true, stdio: 'pipe' }); } catch (_) { /* 本来就没有 */ }
  }

  reg(['add', `${CLASSES}\\${EXT}`, '/ve', '/d', PROGID, '/f']);
  reg(['add', `${CLASSES}\\${EXT}\\OpenWithProgids`, '/v', PROGID, '/t', 'REG_NONE', '/f']);

  reg(['add', `${CLASSES}\\${PROGID}`, '/ve', '/d', 'Android 应用包', '/f']);
  reg(['add', `${CLASSES}\\${PROGID}`, '/v', 'FriendlyTypeName', '/d', 'Android 应用包', '/f']);
  reg(['add', `${CLASSES}\\${PROGID}\\DefaultIcon`, '/ve', '/d', `"${icon}",0`, '/f']);
  reg(['add', `${CLASSES}\\${PROGID}\\shell\\open`, '/ve', '/d', '安装到 ApkStart', '/f']);
  reg(['add', `${CLASSES}\\${PROGID}\\shell\\open\\command`, '/ve', '/d', command, '/f']);

  notifyShell();
  return { ok: true, progId: PROGID, previous: prev };
}

/**
 * 取消关联。有关联前记录就原样还原；没有记录且当前默认值仍是我们的才清空；
 * 当前默认值是别人的则一个字节都不动。
 */
function unregisterAssociation() {
  if (process.platform === 'linux') {
    const paths = linuxPaths();
    const previous = linuxReadRecordedPrev();
    const current = linuxCurrentDefault();
    let restored = '';
    if (previous && previous !== LINUX_DESKTOP_ID) {
      if (linuxSetDefault(previous)) restored = previous;
    } else if (current === LINUX_DESKTOP_ID) {
      // 没有可还原的旧值时，只把 mimeapps.list 里我们那一行去掉。
      try {
        const text = fs.readFileSync(paths.mimeapps, 'utf8');
        const next = text.split(/\r?\n/).filter((l) => !new RegExp(`^\\s*${LINUX_MIME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`).test(l)).join('\n');
        fs.writeFileSync(paths.mimeapps, next, 'utf8');
      } catch (_) { /* ignore */ }
    }
    try { fs.unlinkSync(paths.desktop); } catch (_) { /* 本来就没有 */ }
    try { fs.unlinkSync(paths.prev); } catch (_) { /* ignore */ }
    linuxRefresh();
    return { ok: true, restored };
  }

  reg(['delete', `${CLASSES}\\${EXT}\\OpenWithProgids`, '/v', PROGID, '/f']);
  reg(['delete', `${CLASSES}\\${PROGID}`, '/f']);

  const prev = readPrev();
  const current = regDefault(`${CLASSES}\\${EXT}`);
  let restored = '';
  if (prev) {
    reg(['add', `${CLASSES}\\${EXT}`, '/ve', '/d', prev, '/f']);
    restored = prev;
  } else if (current === PROGID) {
    reg(['add', `${CLASSES}\\${EXT}`, '/ve', '/d', '', '/f',]);
  }
  try { execFileSync('reg', ['delete', STORE_KEY, '/v', PREV_VALUE, '/f'], { windowsHide: true, stdio: 'pipe' }); } catch (_) { /* ignore */ }
  notifyShell();
  return { ok: true, restored };
}

/** 供设置页显示「双击 APK 是否已交给 ApkStart」 */
function associationStatus() {
  if (process.platform === 'linux') {
    return { registered: linuxCurrentDefault() === LINUX_DESKTOP_ID && fs.existsSync(linuxPaths().desktop) };
  }
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Classes\\.apk', '/ve'], { windowsHide: true, encoding: 'utf8' });
    return { registered: out.includes(PROGID) };
  } catch (_) {
    return { registered: false };
  }
}

module.exports = {
  registerAssociation, unregisterAssociation, associationStatus,
  PROGID, LINUX_MIME, LINUX_DESKTOP_ID,
  linuxDesktopEntry, linuxWriteMimeDefault, mimeDefaultIn,
};
