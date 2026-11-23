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
 * All process management goes through deps.run / deps.spawn so the class can be
 * tested on machines without ATL installed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Backend, CAPS } = require('./base');

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
  async clearData() { return { ok: true }; }
  async disposeInput() { /* no persistent shell */ }
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
  }

  get caps() { return new Set([CAPS.shutdown]); }
  running() { return this._running; }
  client() { return this._client; }

  /** Self-contained ATL prefix, owned by ApkStart rather than the system. */
  portableRoot() {
    const base = process.env.APPDATA
      || process.env.XDG_DATA_HOME
      || path.join(os.homedir(), '.local', 'share');
    return path.join(base, 'apkstart', 'runtime', 'atl');
  }

  /** Environment for a portable ATL binary; harmless for a system install. */
  _env() {
    const root = this.portableRoot();
    const env = { ...process.env };
    env.LD_LIBRARY_PATH = [path.join(root, 'lib'), path.join(root, 'lib64'), env.LD_LIBRARY_PATH].filter(Boolean).join(':');
    if (fs.existsSync(path.join(root, 'share', 'bionic_translation'))) {
      env.BIONIC_TRANSLATION_CONFIG = path.join(root, 'share', 'bionic_translation', 'cfg.d', 'bionic_translation.cfg');
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

  /** Translate an Android class name into ATL's slash-separated form. */
  static activityArg(activity) {
    const a = String(activity || '').trim();
    if (!a) return null;
    const last = a.includes('/') ? a.split('/').pop() : a;
    const slash = last.replace(/\./g, '/');
    return slash.includes('/') ? ['-l', slash] : null;
  }

  /** Launch an APK as a native desktop process. */
  async launchApp(pkg, activity) {
    const app = this.deps.store && this.deps.store.getApp ? this.deps.store.getApp(pkg) : null;
    const apk = app && app.apkPath;
    if (!apk || !fs.existsSync(apk)) return { ok: false, error: `No cached APK for ${pkg}` };
    const args = [apk, ...(AtlBackend.activityArg(activity || (app && app.activity)) || [])];
    let child;
    try {
      child = this.spawner(this.binary, args, {
        stdio: 'ignore', detached: true, env: this._env(),
      });
    } catch (e) {
      return { ok: false, error: e.message };
    }
    if (child && child.on) {
      child.on('error', () => {});
      child.on('exit', () => { this._children.delete(pkg); });
      if (child.unref) child.unref();
    }
    this._children.set(pkg, child);
    this._running = true;
    return { ok: true, launched: true, pid: child && child.pid };
  }

  running() { return [...this._children.keys()]; }

  async stopApp(pkg) {
    const child = this._children.get(pkg);
    if (!child || !child.pid) return { ok: true };
    try { process.kill(child.pid, 'SIGTERM'); } catch (_) { /* already gone */ }
    this._children.delete(pkg);
    return { ok: true };
  }

  async stop() {
    const pkgs = [...this._children.keys()];
    for (const pkg of pkgs) {
      // eslint-disable-next-line no-await-in-loop
      await this.stopApp(pkg);
    }
    this._running = false;
    return { ok: true, note: 'ATL applications stopped' };
  }

  usage() { return { total: 0, items: [{ label: 'ATL processes', size: 0 }] }; }

  diagnose() {
    return { backend: this.id, binary: this.binary, running: this.running() };
  }
}

module.exports = { AtlBackend, AtlClient };
