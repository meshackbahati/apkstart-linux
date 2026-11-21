'use strict';
/**
 * 平台差异的单一收口：二进制文件名、官方下载地址、KVM 可用性。
 *
 * 为什么单独一层：运行时的 Windows 版本把 adb.exe / emulator.exe / qemu-img.exe
 * 写死在七八个文件里，移植 Linux 时漏掉任何一处都会表现为「装好了却起不来」。
 * 这里把差异收敛成纯函数，并允许测试注入平台，不需要真的换机器。
 */
const fs = require('fs');

const KVM_DEVICE = '/dev/kvm';

function isLinux(platform = process.platform) { return platform === 'linux'; }
function isWin(platform = process.platform) { return platform === 'win32'; }

/** 运行时里各工具的可执行文件名（Google 的 Linux 包不带 .exe） */
function bin(name, platform = process.platform) {
  const exe = {
    adb: 'adb',
    fastboot: 'fastboot',
    emulator: 'emulator',
    'emulator-check': 'emulator-check',
    'qemu-img': 'qemu-img',
    'qemu-system-x86_64': 'qemu-system-x86_64',
    'resize2fs': 'resize2fs',
    'e2fsck': 'e2fsck',
    'mke2fs': 'mke2fs',
  }[name] || name;
  return isWin(platform) ? `${exe}.exe` : exe;
}

/** platform-tools 与 emulator 的官方包地址：按平台挑，避免把 Windows 包装到 Linux 上 */
const ADB_ZIP = {
  win32: 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip',
  linux: 'https://dl.google.com/android/repository/platform-tools-latest-linux.zip',
};
const EMULATOR_FALLBACK = {
  win32: 'https://dl.google.com/android/repository/emulator-windows_x64-16847572.zip',
  linux: 'https://dl.google.com/android/repository/emulator-linux_x64-16970787.zip',
};

function adbZipUrl(platform = process.platform) {
  return ADB_ZIP[platform] || ADB_ZIP.win32;
}

function emulatorFallbackUrl(platform = process.platform) {
  return EMULATOR_FALLBACK[platform] || EMULATOR_FALLBACK.win32;
}

/** ZIP 条目在 Linux 上是否需要可执行位（ZIP 不保存 POSIX mode，必须手工补） */
const EXECUTABLE_NAMES = new Set([
  'adb', 'fastboot', 'emulator', 'emulator-check', 'qemu-img', 'qemu-system-x86_64',
  'resize2fs', 'e2fsck', 'mke2fs', 'adbkeygen', 'etc1tool', 'sqlite3',
  // emulator 37.x 的 Linux 包还带这些后台工具；漏掉 netsimd 会在开机时
  // 报 Permission denied（实测），虽然不致命但说明解压权限补全不完整。
  'netsimd', 'nimble_bridge', 'mksdcard', 'crashreport', 'qsn',
]);

function unixExecutableEntry(name) {
  const n = String(name || '').replace(/\\/g, '/');
  const base = n.slice(n.lastIndexOf('/') + 1);
  if (EXECUTABLE_NAMES.has(base)) return true;
  // emulator/bin64/ 下的辅助工具没有扩展名，Linux 包里它们必须可执行
  return /(^|\/)bin64\//.test(n) && !/\.[^/]+$/.test(base);
}

/** 本项目 GitHub Release 里的运行时整包：Linux 必须挑带 -linux 的资产 */
function runtimePackPattern(platform = process.platform) {
  return isLinux(platform)
    ? /^ApkStart-runtime-linux-.*\.zip$/i
    : /^ApkStart-runtime-(?!linux-).*\.zip$/i;
}

/** SDK 索引里匹配 emulator 包的规则：两个平台的包名只差平台段 */
function emulatorUrlMatch(platform = process.platform) {
  return isLinux(platform) ? /linux_x64.*\.zip$/i : /windows_x64.*\.zip$/i;
}

/**
 * /dev/kvm 是否真的可用。存在但没权限也算不可用：那会表现为 emulator 启动后
 * 报加速失败，用户在界面上看到的却是「未检测到硬件加速」，无从下手。
 */
function kvmAvailable() {
  if (!fs.existsSync(KVM_DEVICE)) return false;
  try {
    // eslint-disable-next-line no-bitwise
    fs.accessSync(KVM_DEVICE, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * 把 Linux 上 `emulator -accel-check` 的输出翻译成统一结果。
 * 单独成纯函数，便于在没有 KVM 的 CI 上验证解析逻辑。
 */
function accelFromLinuxCheck(text, { kvm = false } = {}) {
  const s = String(text || '');
  const ok = /accel:\s*\n?0\b/.test(s) && !/not installed|not available|ERROR_ACCESS_DENIED/i.test(s);
  if (ok && (/kvm/i.test(s) || kvm)) {
    return { ok: true, kind: 'kvm', note: 'KVM 硬件加速已启用' };
  }
  return {
    ok: false,
    kind: 'none',
    viaTcg: true,
    kvm,
    note: kvm
      ? 'KVM 设备存在但模拟器未能启用加速：请确认当前用户对 /dev/kvm 有读写权限（通常是加入 kvm 组后重新登录）'
      : '未检测到 /dev/kvm：请在 BIOS 开启虚拟化（Intel VT-x / AMD SVM），并确认宿主内核已加载 kvm 模块',
  };
}

module.exports = {
  KVM_DEVICE, isLinux, isWin, bin, unixExecutableEntry,
  adbZipUrl, emulatorFallbackUrl, emulatorUrlMatch, runtimePackPattern,
  kvmAvailable, accelFromLinuxCheck,
};
