'use strict';
/**
 * Backend: Android Translation Layer on Linux.
 *
 * ATL reimplements the Android application framework on top of the desktop
 * Linux stack. An APK runs as an ordinary process in its own Wayland or X11
 * window, so there is no container, no Android boot and no fixed guest memory
 * allocation. The cost is compatibility: support is app by app, and services
 * such as Google Play, DRM, FCM and Binder are out of scope upstream.
 *
 * The launch path follows ATL's own conventions: the APK operand is named
 * <package>.apk because ATL derives its data folder from that name, the data
 * directory is passed explicitly, and window size, SDK level and application
 * ID are supplied on the command line. All process management goes through
 * deps.run / deps.spawn so the class can be tested without ATL installed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Backend, CAPS } = require('./base');
const store = require('../store');

const ATL_DEFAULT_SIZE = [1200, 850];
const SIZE_MIN = 200;
const SIZE_MAX = 10000;
const SDK_FLOOR = 21;
const SDK_CEIL = 36;
const SIZE_RE = /^(\d{3,4})x(\d{3,4})$/;

function defaultRun(cmd, args, opts = {}) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(cmd, args, {
    encoding: 'utf8', timeout: opts.timeout || 10000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: !r.error && r.status === 0,
    stdout: String((r.stdout && r.stdout.toString()) || ''),
    stderr: String((r.stderr && r.stderr.toString()) || ''),
  };
}

/** Package names are used as path components and window IDs, so constrain them here. */
function safePart(pkg) {
  return String(pkg || '').replace(/[^A-Za-z0-9._-]/g, '_') || 'unknown';
}

/** Accept WxH within ATL's useful range, otherwise fall back to the default. */
function parseSize(value) {
  const m = SIZE_RE.exec(String(value || ''));
  if (!m) return [...ATL_DEFAULT_SIZE];
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (w < SIZE_MIN || w > SIZE_MAX || h < SIZE_MIN || h > SIZE_MAX) return [...ATL_DEFAULT_SIZE];
  return [w, h];
}

/**
 * Pick the SDK level passed to ATL: an explicit override, otherwise the app's
 * targetSdk bounded below by its minSdk, with a floor of 21 and a ceiling
 * matching the newest ATL supports.
 */
function sdkFor(app = {}, override) {
  const clamp = (n) => Math.max(SDK_FLOOR, Math.min(SDK_CEIL, Math.trunc(n)));
  if (override !== undefined && override !== null && override !== '') {
    const n = Number(override);
    return Number.isFinite(n) ? clamp(n) : null;
  }
  const target = Number(app.targetSdk || app.target_sdk);
  if (!Number.isFinite(target)) return null;
  const min = Number(app.minSdk || app.min_sdk || 0);
  return clamp(Math.max(target, Number.isFinite(min) ? min : 0));
}

function findTrustStore() {
  return [
    '/etc/ssl/certs/java/cacerts',
    '/usr/lib/jvm/default-java/lib/security/cacerts',
    '/usr/local/share/ca-certificates/cacerts',
  ].find((f) => fs.existsSync(f)) || '';
}

/**
 * Minimal stand-in for AdbClient. Installer and Runtime call these methods
 * even when no adb device exists; returning safe defaults keeps the shared
 * install and launch flow unchanged.
 */
class AtlClient {
  constructor(backend) {
    this.backend = backend;
    this.serial = 'atl';
    this.adbPath = '';
  }

  async shell(command) {
    // Installer polls `pidof <pkg>` to decide whether a launched app is alive.
    // ATL processes are tracked directly, so report a synthetic PID for them.
    const m = /pidof\s+([A-Za-z][\w.]*)/.exec(String(command || ''));
    if (m && this.backend.running().includes(m[1])) return '1';
    return '';
  }
  async isOnline() { return true; }
  async devices() { return [{ serial: 'atl', state: 'device' }]; }
  async resetDisplayOverrides() { /* no Android display to override */ }
  async isInstalled() { return true; }
  async install() { return { ok: true, atl: true }; }
  async installMultiple() { return { ok: true, atl: true }; }
  async forceStop(pkg) { return this.backend.stopApp(pkg); }
  async startApp(pkg, activity) { return this.backend.launchApp(pkg, activity); }
  async runningPackages() { return this.backend.running(); }
  async clearData(pkg) { return this.backend.clearData(pkg); }
  async uninstall(pkg) { return this.backend.uninstallApp(pkg); }
  async disposeInput() { /* no persistent shell */ }

  // The shared install and launch flow was written for an adb device. ATL has
  // no device, so the device-only steps below are answered locally: no-ops
  // where there is nothing to configure, and real answers where ATL has one.
  async connect() { return true; }
  async deviceState() { return 'device'; }
  async exec() { return { stdout: '', stderr: '', code: 0 }; }
  async sdkInt() { return SDK_CEIL; }
  async androidVersion() { return 'ATL'; }
  async batteryOptimizeOff() { return true; }
  async dismissPermissionDialog() { return false; }
  async ensureChineseIme() { return false; }
  async ensureChineseLocale() { return false; }
  async ensureFreeform() { return true; }
  async prepareForeground() { return true; }
  async setOrientation() { return true; }
  /** ATL has no permission prompts to pre-grant; nothing is granted. */
  async grantRuntimePermissions() { return []; }

  /** The launcher activity comes from the APK, recorded at install time. */
  async resolveLauncher(pkg) {
    const st = this.backend.deps.store;
    const app = st && st.getApp ? st.getApp(pkg) : null;
    const act = app && (app.activity || app.launchActivity);
    if (!act) return null;
    return act.includes('/') ? act : `${pkg}/${act}`;
  }

  /** ATL draws its own window; treat "still running after launch" as the first frame. */
  async waitForAppFirstFrame(pkg, { timeoutMs = 4000, intervalMs = 250 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (!this.backend.running().includes(pkg)) return false;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return this.backend.running().includes(pkg);
  }
}

class AtlBackend extends Backend {
  static get id() { return 'atl'; }

  static get label() { return 'Android Translation Layer (native windows)'; }

  static get summary() {
    return 'Runs compatible APKs as ordinary Linux processes in their own windows, with no container and no Android boot. Compatibility is app by app.';
  }

  static get embedCapable() { return false; }

  constructor(appRoot, deps = {}) {
    super(appRoot, deps);
    this.run = typeof deps.run === 'function' ? deps.run : defaultRun;
    this.spawner = typeof deps.spawn === 'function' ? deps.spawn : spawn;
    this.binary = deps.binary || '';
    this._children = new Map();
    this._client = new AtlClient(this);
    this._running = false;
    this.cacerts = deps.cacerts !== undefined ? deps.cacerts : findTrustStore();
    const base = (deps.store && deps.store.DATA_DIR) || store.DATA_DIR
      || path.join(os.homedir(), '.local', 'share', 'apkstart');
    this.atlDir = deps.atlDir || path.join(base, 'atl');
    // How long launchApp waits to catch an immediate crash. Only real
    // processes need it; injected spawners in tests return at once.
    this.settleMs = deps.settleMs !== undefined ? deps.settleMs : (deps.spawn ? 0 : 2500);
  }

  get caps() { return new Set([CAPS.shutdown]); }
  client() { return this._client; }

  get runDir() { return path.join(this.atlDir, 'run'); }
  get logDir() { return path.join(this.atlDir, 'logs'); }
  pidFile(pkg) { return path.join(this.runDir, `${safePart(pkg)}.pid`); }
  logFile(pkg) { return path.join(this.logDir, `${safePart(pkg)}.log`); }

  /**
   * PID files let a later process (for example `apkstart --stop <app>` or the
   * GUI after a restart) find and stop apps launched by an earlier one.
   */
  _writePid(pkg, pid) {
    if (!pid) return;
    try {
      fs.mkdirSync(this.runDir, { recursive: true });
      fs.writeFileSync(this.pidFile(pkg), `${pid}\n`);
    } catch (_) { /* tracking is best effort */ }
  }

  _clearPid(pkg) {
    try { fs.unlinkSync(this.pidFile(pkg)); } catch (_) { /* already gone */ }
  }

  _readPid(pkg) {
    try {
      const n = Number(fs.readFileSync(this.pidFile(pkg), 'utf8').trim());
      return Number.isInteger(n) && n > 1 ? n : 0;
    } catch (_) { return 0; }
  }

  /** Alive and still the ATL process for this package (guards against PID reuse). */
  _pidAlive(pid, pkg) {
    if (!pid) return false;
    try { process.kill(pid, 0); } catch (e) { if (e.code !== 'EPERM') return false; }
    try {
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      return cmd.includes(`${safePart(pkg)}.apk`);
    } catch (_) {
      return process.platform !== 'linux';
    }
  }

  /** Last lines of an app's ATL log, for error messages. */
  logTail(pkg, lines = 20) {
    try {
      const text = fs.readFileSync(this.logFile(pkg), 'utf8');
      return text.trimEnd().split('\n').slice(-lines).join('\n');
    } catch (_) { return ''; }
  }

  /** Self-contained ATL prefix, owned by ApkStart rather than the system. */
  portableRoot() {
    const base = process.env.APPDATA
      || process.env.XDG_DATA_HOME
      || path.join(os.homedir(), '.local', 'share');
    return path.join(base, 'apkstart', 'runtime', 'atl');
  }

  /** Environment for a portable ATL binary; harmless for a system install. */
  _env(pkg = '', cfg = {}) {
    const root = this.portableRoot();
    const env = { ...process.env };
    env.LD_LIBRARY_PATH = [path.join(root, 'lib'), path.join(root, 'lib', 'art'), path.join(root, 'lib64'), env.LD_LIBRARY_PATH].filter(Boolean).join(':');
    if (fs.existsSync(path.join(root, 'share', 'bionic_translation'))) {
      env.BIONIC_TRANSLATION_CONFIG = path.join(root, 'share', 'bionic_translation', 'cfg.d', 'bionic_translation.cfg');
    }
    if (pkg) {
      const data = path.join(this.atlDir, 'data', safePart(pkg));
      fs.mkdirSync(data, { recursive: true });
      env.ANDROID_APP_DATA_DIR = data;
      env.ATL_UGLY_ENABLE_WEBVIEW = cfg.webview === false ? '' : '1';
      if (cfg.titlebar) env.ATL_TITLEBAR = String(cfg.titlebar);
      if (cfg.mouseAsTouch) env.ATL_MOUSE_AS_TOUCH = '1';
      if (Array.isArray(cfg.deniedPermissions) && cfg.deniedPermissions.length) {
        env.ATL_DENIED_PERMISSIONS = cfg.deniedPermissions.join(',');
      }
      env.ATL_NAVIGATION_TOOLTIPS = ['Back', 'Start page of the app', 'Open pages of the app'].join('\n');
      const icon = path.join(store.ICON_DIR || path.join(path.dirname(this.atlDir), 'icons'), `${safePart(pkg)}.png`);
      if (fs.existsSync(icon)) env.ATL_APP_ICON = icon;
    }
    return env;
  }

  async probe() {
    // Probing is platform-neutral so the backend can be unit-tested on any
    // host; actual use is gated by the Linux-only setup module.
    if (this.binary && fs.existsSync(this.binary)) {
      return { ok: true, found: true, path: this.binary, detail: 'configured ATL binary' };
    }
    const found = this.run('sh', ['-c', 'command -v android-translation-layer || true']);
    const bin = String(found.stdout || '').trim();
    if (bin) { this.binary = bin; return { ok: true, found: true, path: bin, detail: 'android-translation-layer on PATH' }; }
    const portable = this.portableRoot();
    const candidates = [
      path.join(portable, 'bin', 'android-translation-layer'),
      path.join(os.homedir(), '.local', 'bin', 'android-translation-layer'),
      '/usr/local/bin/android-translation-layer',
      path.join(this.appRoot || '', 'runtime', 'atl', 'bin', 'android-translation-layer'),
    ];
    const local = candidates.find((c) => fs.existsSync(c));
    if (local) { this.binary = local; return { ok: true, found: true, path: local, detail: 'local ATL build' }; }
    return { ok: true, found: false, detail: 'ATL is not installed; run scripts/setup-atl.sh' };
  }

  async check() {
    const p = await this.probe();
    return p.found ? { ok: true, status: p.path } : { ok: false, reason: p.detail, needs: 'atl' };
  }

  async resolveAdb() { return ''; }

  async ensure() {
    const c = await this.check();
    if (!c.ok) return { ok: false, error: c.reason || 'ATL unavailable', needsSetup: 'atl' };
    this._running = true;
    return { ok: true, client: this._client, reused: true, backend: 'atl', engine: 'atl', noAdb: true };
  }

  async windowTargets() { return []; }
  async windowReady() { return { ok: true, reason: 'ATL creates the application window itself' }; }
  async hideWindow() { return null; }

  /** Translate an Android class name into ATL's launch form. */
  static activityArg(activity) {
    const a = String(activity || '').trim();
    if (!a) return null;
    const last = a.includes('/') ? a.split('/').pop() : a;
    const slash = last.replace(/\./g, '/');
    return slash.includes('/') ? ['-l', slash] : null;
  }

  _appConfig(pkg) {
    const s = this.deps.store && this.deps.store.getSettings ? this.deps.store.getSettings() : null;
    return (s && s.atl && s.atl[pkg]) || {};
  }

  /**
   * ATL names its data folder after the APK file name. Our cache uses a
   * versioned name, so expose a stable <pkg>.apk operand through a symlink
   * built atomically. Falls back to a copy where symlinks are unavailable.
   */
  prepareApk(pkg, apkPath) {
    const dir = path.join(this.atlDir, 'launch');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${safePart(pkg)}.apk`);
    const tmp = `${dest}.${process.pid}.tmp`;
    try { fs.unlinkSync(tmp); } catch (_) { /* no stale temp */ }
    try {
      fs.symlinkSync(path.resolve(apkPath), tmp);
    } catch (_) {
      fs.copyFileSync(apkPath, tmp);
    }
    try { fs.unlinkSync(dest); } catch (_) { /* first launch */ }
    fs.renameSync(tmp, dest);
    return dest;
  }

  /** Build ATL's argv from the cached APK, split parts and per-app settings. */
  buildArgs(pkg, apk, app = {}, cfg = {}) {
    const args = [apk];
    const parts = (Array.isArray(app.splits) ? app.splits : []).filter((p) => p && fs.existsSync(p));
    args.push(...parts);
    const [w, h] = parseSize(cfg.size || app.atlSize);
    args.push('-w', String(w), '-h', String(h));
    const sdk = sdkFor(app, cfg.sdk);
    if (sdk) args.push('--sdk-int', String(sdk));
    args.push('--gapplication-app-id', `com.apkstart.${safePart(pkg)}`);
    if (this.cacerts) args.push('-X', `-Djavax.net.ssl.trustStore=${this.cacerts}`);
    const activity = AtlBackend.activityArg(cfg.activity || (app && app.activity));
    if (activity) args.push(...activity);
    return args;
  }

  /** Launch an APK as a native desktop process. */
  async launchApp(pkg, activity) {
    const app = this.deps.store && this.deps.store.getApp ? this.deps.store.getApp(pkg) : null;
    const apk = app && app.apkPath;
    if (!apk || !fs.existsSync(apk)) return { ok: false, error: `No cached APK for ${pkg}` };
    const cfg = this._appConfig(pkg);
    if (activity) cfg.activity = activity;
    let args;
    let env;
    let stable;
    try {
      stable = this.prepareApk(pkg, apk);
      args = this.buildArgs(pkg, stable, app || {}, cfg);
      env = this._env(pkg, cfg);
    } catch (e) {
      return { ok: false, error: e.message };
    }
    // Keep ATL's output: when an app fails, the Java or native stack trace in
    // this log is the only way to see which framework API is missing.
    let fd = null;
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
      fd = fs.openSync(this.logFile(pkg), 'a');
      fs.writeSync(fd, `\n=== ${new Date().toISOString()} ${this.binary} ${args.join(' ')}\n`);
    } catch (_) { fd = null; }
    let child;
    try {
      child = this.spawner(this.binary, args, {
        stdio: fd !== null ? ['ignore', fd, fd] : 'ignore', detached: true, env,
      });
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      if (fd !== null) { try { fs.closeSync(fd); } catch (_) { /* ignore */ } }
    }
    let exited = null;
    if (child && child.on) {
      child.on('error', (e) => { exited = { code: -1, error: e.message }; });
      child.on('exit', (code, signal) => {
        exited = { code, signal };
        this._children.delete(pkg);
        this._clearPid(pkg);
      });
      if (child.unref) child.unref();
    }
    this._children.set(pkg, child);
    this._writePid(pkg, child && child.pid);
    this._running = true;

    // An app that ATL cannot run usually dies within a second or two. Report
    // that as a failed launch with the reason, instead of a silent no-op.
    const deadline = Date.now() + this.settleMs;
    while (!exited && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100));
    }
    if (exited && (exited.code !== 0 || exited.signal || exited.error)) {
      const why = exited.error || (exited.signal ? `signal ${exited.signal}` : `exit code ${exited.code}`);
      return {
        ok: false,
        error: `ATL stopped ${pkg} right after start (${why}). Log: ${this.logFile(pkg)}`,
        log: this.logFile(pkg),
        logTail: this.logTail(pkg),
      };
    }
    return {
      ok: true, launched: true, pid: child && child.pid, args, dataDir: env.ANDROID_APP_DATA_DIR, log: this.logFile(pkg),
    };
  }

  /** Remove only this application's ATL data directory. */
  async clearData(pkg) {
    const dir = path.join(this.atlDir, 'data', safePart(pkg));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { return { ok: false, error: e.message }; }
    return { ok: true };
  }

  /** Packages with a live ATL process, including ones launched by another ApkStart process. */
  running() {
    const live = new Set(this._children.keys());
    let files = [];
    try { files = fs.readdirSync(this.runDir); } catch (_) { /* nothing tracked */ }
    for (const f of files) {
      if (!f.endsWith('.pid')) continue;
      const pkg = f.slice(0, -4);
      if (live.has(pkg)) continue;
      if (this._pidAlive(this._readPid(pkg), pkg)) live.add(pkg);
      else this._clearPid(pkg);
    }
    return [...live];
  }

  async stopApp(pkg) {
    const child = this._children.get(pkg);
    const pid = (child && child.pid) || this._readPid(pkg);
    this._children.delete(pkg);
    if (pid && (child || this._pidAlive(pid, pkg))) {
      // ATL was started detached, so it leads its own process group: signal the
      // group to take helper processes down with it, then fall back to the PID.
      try { process.kill(-pid, 'SIGTERM'); } catch (_) {
        try { process.kill(pid, 'SIGTERM'); } catch (__) { /* already gone */ }
      }
    }
    this._clearPid(pkg);
    return { ok: true };
  }

  async stop() {
    for (const pkg of this.running()) {
      // eslint-disable-next-line no-await-in-loop
      await this.stopApp(pkg);
    }
    this._running = false;
    return { ok: true, note: 'ATL applications stopped' };
  }

  /** Stop the app and remove everything ATL kept for it. */
  async uninstallApp(pkg) {
    await this.stopApp(pkg);
    const safe = safePart(pkg);
    for (const p of [
      path.join(this.atlDir, 'data', safe),
      path.join(this.atlDir, 'launch', `${safe}.apk`),
      this.logFile(pkg),
    ]) {
      try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) { /* keep going */ }
    }
    return { ok: true, atl: true };
  }

  /** Disk used by each app's ATL data directory. */
  usage() {
    const dirSize = (dir) => {
      let total = 0;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return 0; }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        try {
          if (e.isDirectory()) total += dirSize(p);
          else if (e.isFile()) total += fs.statSync(p).size;
        } catch (_) { /* vanished while scanning */ }
      }
      return total;
    };
    const root = path.join(this.atlDir, 'data');
    let pkgs = [];
    try { pkgs = fs.readdirSync(root); } catch (_) { /* no data yet */ }
    const items = pkgs.map((p) => ({ label: p, size: dirSize(path.join(root, p)) }));
    return { total: items.reduce((n, i) => n + i.size, 0), items };
  }

  diagnose() {
    return {
      backend: this.id, binary: this.binary, running: this.running(), atlDir: this.atlDir, logDir: this.logDir,
    };
  }
}

module.exports = {
  AtlBackend, AtlClient, parseSize, sdkFor, safePart,
  ATL_DEFAULT_SIZE, SIZE_MIN, SIZE_MAX, SDK_FLOOR, SDK_CEIL,
};
