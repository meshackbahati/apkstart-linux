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
const { Backend, CAPS } = require('./base');
const platform = require('../platform');

const ADB_PORT = 16384;
const SERIAL = `127.0.0.1:${ADB_PORT}`;

/** Waydroid 1.6.x exposes adb on the container IP; older builds use the local bridge. */
function detectSerial(run, adbPath) {
  const devices = run(adbPath, ['devices'], { timeout: 10000 });
  const lines = String(devices.stdout || '').split(/\r?\n/).slice(1);
  const online = lines.find((l) => /\s+device$/.test(l.trim()));
  if (online) return online.trim().split(/\s+/)[0];
  return SERIAL;
}

function defaultRun(cmd, args, opts = {}) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(cmd, args, {
    encoding: 'utf8', timeout: opts.timeout || 15000, stdio: ['ignore', 'pipe', 'pipe'],
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

  async ensure({ onLog = () => {} } = {}) {
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
    // Waydroid 1.6+ provides `waydroid adb connect`; older builds need the
    // local bridge. Try both, then read the actual serial from adb devices.
    const viaWaydroid = this.run('waydroid', ['adb', 'connect'], { timeout: 20000 });
    if (!viaWaydroid.ok) {
      const connected = this.run(adbPath, ['connect', SERIAL]);
      const text = `${connected.stdout}${connected.stderr}`;
      if (!/connected|already connected/i.test(text)) {
        return { ok: false, error: `adb connect failed: ${text.trim()}` };
      }
    }
    const serial = detectSerial(this.run, adbPath);
    this.adbPath = adbPath;
    this._running = true;
    this.serial = serial;
    return { ok: true, serial, adbPath, reused: true, engine: 'waydroid' };
  }

  _findAdb() {
    // Prefer the adb shipped by ApkStart; fall back to the system one.
    const { existsSync } = require('fs');
    const path = require('path');
    const candidates = [
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
  launchApp(pkg) {
    if (!/^[A-Za-z][\w.]*$/.test(String(pkg || ''))) return Promise.resolve({ ok: false, error: 'invalid package' });
    const child = spawn('waydroid', ['app', 'launch', pkg], {
      stdio: 'ignore', detached: true, env: process.env,
    });
    child.on('error', () => {});
    child.unref();
    return Promise.resolve({ ok: true, launched: true });
  }

  async stop() {
    if (!this._startedByUs) return { ok: true, note: 'left the user Waydroid session running' };
    const r = this.run('waydroid', ['session', 'stop'], { timeout: 30000 });
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
