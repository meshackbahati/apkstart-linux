'use strict';
/**
 * Build a static, self-contained copy of the settings UI for screenshot runs.
 *
 * Electron cannot always be installed in a documentation/CI environment, so
 * the screenshots are captured from the real HTML/CSS/JS with a stubbed IPC
 * bridge. The bridge mirrors src/preload.js and returns deterministic fixture
 * data; no Android runtime, network access or user settings are involved.
 *
 * Usage: node tools/ui-screenshot-fixture.js [outDir]
 * Default outDir: test/out/ui-fixture
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const UI = path.join(ROOT, 'src', 'ui');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'test', 'out', 'ui-fixture'));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const name of fs.readdirSync(UI)) {
  const from = path.join(UI, name);
  const to = path.join(OUT, name);
  if (fs.statSync(from).isDirectory()) {
    if (name === 'assets') fs.cpSync(from, to, { recursive: true });
  } else {
    fs.copyFileSync(from, to);
  }
}

const STUB = String.raw`
'use strict';
// Deterministic fixture responses for UI screenshots. Mirrors src/preload.js.
const SETTINGS = {
  adbPath: '', runtime: { isoPath: '', sourcePreference: 'auto', autoMirror: true,
    giteeToken: '', mirrorPrefix: '', downloadConnections: 8 },
  engine: {
    memoryMB: 2048, cores: 2, idleShutdownMinutes: 5, audio: true, liteMode: true,
    prewarm: true, priorityMode: 'balanced', deepTrim: false, mouseRightBack: true,
    mouseWheelMode: 'smooth', mouseSideButtons: false, keymapEnabled: true,
    resourceMode: 'save', renderSize: 'auto', dataPartitionGB: 4, dnsPreset: 'cn',
    fastDns: true, locale: 'en-US', chineseIme: false, keepSnapshot: true,
    logLimitKB: 2048, backend: 'builtin',
  },
  display: {
    mode: 'window', portrait: '720x1280', landscape: false, orientationMode: 'auto',
    autoRotate: true, tabletMode: true, windowEmbed: false,
    autoFullscreenOnLaunch: false,
  },
  createShortcutOnInstall: true, createStartMenuShortcut: true,
  shortcutDir: '', sharedDir: '/home/user/ApkStartShared',
  deviceSharedDir: '/sdcard/ApkStartShared', autoStart: false,
  notifyOnInstall: true,
  debug: { auto: true, intervalMin: 10, notify: false },
  welcome: { disabled: true },
};
const STATUS = {
  mode: 'builtin', backend: 'builtin', backendLabel: '内置 QEMU',
  installed: true, adbOk: true, vmRunning: false, deviceOnline: true,
  ready: true, phase: 'idle', needsSetup: null, error: '', freeform: true,
  android: '14', serial: 'emulator-5554',
  env: { adb: { ok: true }, emulator: { ok: true }, sysimg: { ok: true } },
  accel: { ok: true, kind: 'kvm' }, network: { ok: true },
};
const APPS = [
  { package: 'com.example.shortvideo', label: '示例短视频', versionName: '12.4.0',
    iconUrl: '', accent: '#d97757', pinned: true, lastLaunchAt: Date.now() - 3600000 },
  { package: 'com.example.reader', label: '示例阅读', versionName: '8.1.2',
    iconUrl: '', accent: '#5b8def', lastLaunchAt: Date.now() - 86400000 },
  { package: 'com.example.notes', label: '示例笔记', versionName: '3.7.1',
    iconUrl: '', accent: '#4f9d76', lastLaunchAt: Date.now() - 172800000 },
  { package: 'com.example.maps', label: '示例地图', versionName: '6.2.0',
    iconUrl: '', accent: '#c98cb4', lastLaunchAt: Date.now() - 259200000 },
];
const ISSUES = [
  { code: 'storage.diskLow', category: 'storage', severity: 'warn',
    title: '运行时所在磁盘空间偏紧', hint: '剩余不足 8 GB。', fix: 'disk', detail: '剩余 5.1 GB' },
  { code: 'device.unauthorized', category: 'device', severity: 'error',
    title: '安卓设备未授权调试', hint: '重启运行时后会重新弹出确认框。', fix: 'restartRuntime', detail: '' },
];
const DEBUG_SUMMARY = { total: 2, errors: 1, warns: 1, infos: 0, health: 'error', byCategory: [] };
const EMPTY = {};
const OK = { ok: true };
const fixture = {
  info: () => Promise.resolve({ version: '0.6.4', isDev: true, dataDir: '/home/user/.local/share/apkstart',
    runtimeDir: '/home/user/.local/share/apkstart/runtime' }),
  getSettings: () => Promise.resolve(SETTINGS),
  setSettings: (patch) => {
    Object.assign(SETTINGS.engine, patch.engine || {});
    Object.assign(SETTINGS.display, patch.display || {});
    Object.assign(SETTINGS, patch, { engine: SETTINGS.engine, display: SETTINGS.display });
    return Promise.resolve(SETTINGS);
  },
  listApps: () => Promise.resolve(APPS),
  runtimeStatus: () => Promise.resolve(STATUS),
  runtimeProbe: () => Promise.resolve(STATUS),
  doctorProfile: () => Promise.resolve({ profile: {}, text: '省电 · 2 核 / 2 GB / 720p' }),
  selfCheck: () => Promise.resolve({ issues: ISSUES, accel: { ok: true }, free: 5242880 }),
  doctorReport: () => Promise.resolve({ ok: true, file: '/tmp/apkstart-report.txt' }),
  runtimeUsage: () => Promise.resolve({ totalText: '6.4 GB', reclaimableText: '1.1 GB', count: 2 }),
  dataInfo: () => Promise.resolve({ avdDir: '/home/user/.local/share/apkstart/avd',
    configuredGB: 4, actualGB: 4 }),
  resources: () => Promise.resolve({ memory: {}, cores: {} }),
  startupInfo: () => Promise.resolve({ smoke: true, firstRun: false, autostart: false, tips: [] }),
  androidStatus: () => Promise.resolve({ status: { running: false, wifi: true, airplane: false,
    anim: true, volume: 50, font: 1, density: 320 } }),
  driversList: () => Promise.resolve({ drivers: [], errors: [] }),
  preflightRun: () => Promise.resolve({ items: [] }),
  autodebugState: () => Promise.resolve({ issues: ISSUES, summary: DEBUG_SUMMARY, at: Date.now(), running: false }),
  autodebugRun: () => Promise.resolve({ issues: ISSUES, summary: DEBUG_SUMMARY, at: Date.now(), running: false }),
  autodebugConfig: () => Promise.resolve(SETTINGS.debug),
  updateCheck: () => Promise.resolve({ ok: true, current: '0.6.3', hasUpdate: false, sources: [] }),
  assocStatus: () => Promise.resolve({ registered: false }),
  appInfo: () => Promise.resolve({ version: '0.6.4' }),
  android: {}, keymap: {}, shell: {},
};
// The preload bridge names are methods, not IPC channels; fill the rest with
// harmless defaults so that screenshot states never fail on a missing method.
const target = { shell: {}, android: {}, keymap: {}, on: () => () => {}, pathForFile: (f) => f?.name || '' };
for (const name of ['runtimeLog', 'leftoversScan', 'engineResources', 'displayState',
  'keymapGetPresets', 'keymapIsEnabled', 'provisionCheck', 'startupInfo']) {
  if (!fixture[name]) fixture[name] = () => Promise.resolve(EMPTY);
}
fixture.android.status = () => Promise.resolve({ running: false, wifi: true, airplane: false,
  anim: true, volume: 50, font: 1, density: 320 });
fixture.android.set = () => Promise.resolve(OK);
fixture.android.open = () => Promise.resolve(OK);
fixture.keymap.getPresets = () => Promise.resolve({ presets: [] });
fixture.keymap.isEnabled = () => Promise.resolve({ enabled: true });
fixture.shell.state = () => Promise.resolve({});
fixture.pathForFile = (f) => (f && f.name) || '';
const bridge = new Proxy({ ...target, ...fixture }, {
  get(obj, prop) {
    if (prop in obj) return obj[prop];
    return () => Promise.resolve(OK);
  },
});
window.apkstart = bridge;
`;

const index = path.join(OUT, 'index.html');
const html = fs.readFileSync(index, 'utf8');
const patched = html.replace('<script src="i18n.js"></script>',
  '<script src="stub.js"></script>\n  <script src="i18n.js"></script>');
if (patched === html) throw new Error('could not inject screenshot stub into index.html');
fs.writeFileSync(path.join(OUT, 'stub.js'), STUB);
fs.writeFileSync(index, patched);

console.log(`screenshot fixture ready: ${OUT}`);
