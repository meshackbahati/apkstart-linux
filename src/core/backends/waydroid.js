'use strict';
/**
 * Backend: Waydroid on Linux.
 *
 * Waydroid runs the Android framework in an LXC container on the host kernel.
 * Applications become ordinary Wayland/X11 windows and their /data survives
 * restarts, which is what the QEMU backend cannot provide. This backend uses
 * the bundled adb against Waydroid's local adb bridge, and delegates the
 * application launch to `waydroid app launch` so the window is created by
 * Waydroid rather than by the Android emulator surface.
 *
 * All external commands go through deps.run(cmd, args), which makes the whole
 * class testable on machines without Waydroid installed.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { Backend, CAPS } = require('./base');
const platform = require('../platform');
const { GameControls } = require('../gamecontrols');

const ADB_PORT = 16384;
const SERIAL = `127.0.0.1:${ADB_PORT}`;
const WATCH_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'watch-game.sh');

/**
 * Waydroid 1.6.x exposes adb on the container IP rather than on the old local
 * bridge, so prefer the address reported by `waydroid status`.
 */
function detectAddress(run) {
  const status = run('waydroid', ['status'], { timeout: 10000 });
  const text = `${status.stdout || ''}${status.stderr || ''}`;
  const m = /IP address:\s*(\S+)/.exec(text);
  return m ? `${m[1]}:5555` : SERIAL;
}

/** Read the serial that is actually online from adb. */
function detectSerial(run, adbPath) {
  const devices = run(adbPath, ['devices'], { timeout: 10000 });
  const lines = String(devices.stdout || '').split(/\r?\n/).slice(1);
  const online = lines.find((l) => /\s+device$/.test(l.trim()));
  if (online) return online.trim().split(/\s+/)[0];
  return SERIAL;
}

function defaultRun(cmd, args, opts = {}) {
  const { spawnSync } = require('child_process');
  const path = require('path');
  const os = require('os');
  // AdbClient talks to ApkStart's isolated server on 5044 and pins the adb
  // vendor key. The backend must use the same environment, otherwise the
  // device is connected on 5037 but invisible to every client call.
  const env = { ...process.env, ANDROID_ADB_SERVER_PORT: process.env.ANDROID_ADB_SERVER_PORT || '5044' };
  if (!env.ADB_VENDOR_KEYS) {
    const keyDir = path.join(env.USERPROFILE || env.HOME || os.homedir(), '.android');
    env.ADB_VENDOR_KEYS = keyDir;
  }
  const r = spawnSync(cmd, args, {
    encoding: 'utf8', timeout: opts.timeout || 15000, stdio: ['ignore', 'pipe', 'pipe'], env,
  });
  return {
    ok: !r.error && r.status === 0,
    stdout: String((r.stdout && r.stdout.toString()) || ''),
    stderr: String((r.stderr && r.stderr.toString()) || ''),
  };
}

class WaydroidBackend extends Backend {
  static get id() { return 'waydroid'; }

  static get label() { return 'Waydroid (Linux container)'; }

  static get summary() {
    return 'Runs Android in a shared-kernel container. Applications open as native desktop windows '
      + 'and their data survives restarts. Requires Waydroid, binder and a Wayland session.';
  }

  static get embedCapable() { return false; }

  constructor(appRoot, deps = {}) {
    super(appRoot, deps);
    this.run = typeof deps.run === 'function' ? deps.run : defaultRun;
    this._startedByUs = false;
    this.adbPath = deps.adbPath || '';
    this.serial = SERIAL;
    this.controls = deps.gameControls || new GameControls();
  }

  get caps() { return new Set([CAPS.shutdown]); }

  running() { return this._running === true; }

  async probe() {
    if (!platform.isLinux()) return { ok: true, found: false, detail: 'Waydroid requires Linux' };
    const r = this.run('sh', ['-c', 'command -v waydroid || true']);
    const found = !!r.stdout.trim();
    return { ok: true, found, path: r.stdout.trim(), detail: found ? 'waydroid found on PATH' : 'waydroid not installed' };
  }

  async check() {
    const probe = await this.probe();
    if (!probe.found) return { ok: false, reason: 'Waydroid is not installed' };
    const status = this.run('waydroid', ['status']);
    const text = `${status.stdout}${status.stderr}`;
    if (!/RUNNING/i.test(text)) {
      return { ok: false, reason: 'Waydroid container is not running', needs: 'session' };
    }
    return { ok: true, status: text.trim() };
  }

  async resolveAdb() { return this.adbPath || ''; }

  /**
   * Waydroid freezes an idle container to save CPU. A frozen container ignores
   * adb, so installs and launches hang until it is unfrozen. The setup script
   * grants passwordless access to this single lxc command; when that grant is
   * absent, opening the launcher also thaws the container.
   */
  async _unfreezeIfNeeded(onLog) {
    const st = this.run('waydroid', ['status'], { timeout: 10000 });
    const text = `${st.stdout || ''}${st.stderr || ''}`;
    if (!/Container:\s*FROZEN/i.test(text)) return;
    onLog('Android container is frozen; waking it up');
    const unfreeze = this.run('sudo', ['-n', 'lxc-unfreeze', '-P', '/var/lib/waydroid/lxc', '-n', 'waydroid'], { timeout: 15000 });
    if (!unfreeze.ok) this.run('waydroid', ['app', 'launch', 'com.android.launcher3'], { timeout: 15000 });
  }

  async ensure({ onLog = () => {} } = {}) {
    await this._unfreezeIfNeeded(onLog);
    const check = await this.check();
    if (!check.ok) {
      if (check.needs === 'session') {
        onLog('Starting the Waydroid session…');
        const started = this.run('waydroid', ['session', 'start'], { timeout: 60000 });
        if (!started.ok && !/already running/i.test(`${started.stdout}${started.stderr}`)) {
          return { ok: false, error: `waydroid session start failed: ${started.stderr.trim()}` };
        }
        this._startedByUs = true;
      } else {
        return { ok: false, error: check.reason };
      }
    }
    const adbPath = this.adbPath || this._findAdb();
    if (!adbPath) return { ok: false, error: 'adb not found' };
    // `waydroid adb connect` uses the host's default adb port; ApkStart uses
    // its isolated port, so always connect with our own adb as well.
    this.run('waydroid', ['adb', 'connect'], { timeout: 20000 });
    const address = detectAddress(this.run);
    let connected = this.run(adbPath, ['connect', address]);
    let text = `${connected.stdout}${connected.stderr}`;
    if (!/connected|already connected/i.test(text)) {
      connected = this.run(adbPath, ['connect', SERIAL]);
      text = `${connected.stdout}${connected.stderr}`;
    }
    if (!/connected|already connected/i.test(text)) {
      return { ok: false, error: `adb connect failed: ${text.trim()}` };
    }
    const serial = detectSerial(this.run, adbPath);
    this.adbPath = adbPath;
    this._running = true;
    this.serial = serial;
    return { ok: true, serial, adbPath, reused: true, engine: 'waydroid' };
  }

  _findAdb() {
    // Prefer the adb that ApkStart provisioned; a system adb may not share the
    // same server state or adb keys, which leaves the device "unauthorized".
    const { existsSync } = require('fs');
    const path = require('path');
    const store = this.deps.store;
    const settings = store && typeof store.getSettings === 'function' ? store.getSettings() : {};
    const runtime = this.deps.runtime;
    let provisioned = '';
    try { provisioned = runtime && runtime.provisioner ? runtime.provisioner.paths().adbExe : ''; } catch (_) { /* ignore */ }
    const candidates = [
      settings.adbPath,
      provisioned,
      path.join(this.appRoot || '', 'runtime', 'platform-tools', platform.bin('adb')),
      path.join(this.appRoot || '', 'tools', 'platform-tools', platform.bin('adb')),
      '/usr/bin/adb',
    ];
    return candidates.find((c) => c && existsSync(c)) || '';
  }

  async windowTargets() { return []; }

  async windowReady() { return { ok: true, reason: 'Waydroid creates the application window itself' }; }

  async hideWindow() { return null; }

  /** Launch an application as a native Waydroid window. */
  async launchApp(pkg) {
    if (!/^[A-Za-z][\w.]*$/.test(String(pkg || ''))) return { ok: false, error: 'invalid package' };
    const child = spawn('waydroid', ['app', 'launch', pkg], {
      stdio: 'ignore', detached: true, env: process.env,
    });
    child.on('error', () => {});
    child.unref();
    // Only applications explicitly marked as touch-controlled get key capture.
    const app = this.deps.store && this.deps.store.getApp ? this.deps.store.getApp(pkg) : null;
    const settings = this.deps.store && this.deps.store.getSettings ? this.deps.store.getSettings() : null;
    const wanted = app ? app.touchControls === true : false;
    const globalWanted = !!(settings && settings.input && settings.input.touchControls);
    if (wanted && globalWanted) {
      await this.controls.enable().catch(() => {});
    }
    // The CLI exits immediately after launch, so a detached watcher releases
    // key capture when the game process ends.
    if (this.adbPath && fs.existsSync(WATCH_SCRIPT)) {
      const watcher = spawn('bash', [WATCH_SCRIPT, pkg, this.adbPath, this.serial], {
        stdio: 'ignore', detached: true, env: process.env,
      });
      watcher.on('error', () => {});
      watcher.unref();
    }
    return { ok: true, launched: true };
  }

  async stopApp(pkg) {
    await this.controls.disable().catch(() => {});
    return { ok: true };
  }

  /** Turn touch mapping off even when the game exits without a stop call. */
  async syncControls(runningPackages) {
    const alive = (runningPackages || []).filter((p) => !/launcher|systemui|settings|inputmethod|pinyin/i.test(p));
    if (!alive.length) await this.controls.disable().catch(() => {});
  }

  async stop() {
    await this.controls.disable().catch(() => {});
    if (!this._running && !this._startedByUs) return { ok: true, note: 'Waydroid was not started by ApkStart' };
    // Idle shutdown exists to release the roughly 0.9 GB that the Android
    // container keeps resident, so stop the session even when the user
    // started it. Application data lives in /data and is preserved.
    const r = this.run('waydroid', ['session', 'stop'], { timeout: 30000 });
    if (this.adbPath) this.run(this.adbPath, ['disconnect', this.serial], { timeout: 10000 });
    this._startedByUs = false;
    this._running = false;
    return { ok: r.ok, error: r.ok ? '' : r.stderr.trim() };
  }

  usage() { return { total: 0, items: [{ label: 'Waydroid container', size: 0 }] }; }

  diagnose() {
    return { backend: this.id, serial: this.serial, adbPath: this.adbPath, startedByUs: this._startedByUs };
  }
}

module.exports = { WaydroidBackend, ADB_PORT, SERIAL };
