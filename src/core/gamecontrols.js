'use strict';
/**
 * Keyboard and mouse to touch mapping for Waydroid games.
 *
 * key2touch creates a virtual touchscreen from host input events. Mapping is
 * deliberately not left on globally: an active profile captures keys for the
 * whole desktop, so ApkStart enables it only while a mapped game is running
 * and disables it as soon as that game stops.
 */
const { spawn, spawnSync } = require('child_process');

class GameControls {
  constructor({ run, spawner, env, user } = {}) {
    this.run = run || ((cmd, args) => {
      const r = spawnSync('sudo', ['-n', '-g', 'input', '-u', user || process.env.USER || process.env.USERNAME || 'root', cmd, ...args], {
        encoding: 'utf8', timeout: 10000, env: env || process.env,
      });
      return {
        ok: !r.error && r.status === 0,
        stdout: String((r.stdout && r.stdout.toString()) || ''),
        stderr: String((r.stderr && r.stderr.toString()) || ''),
      };
    });
    this.spawner = spawner || ((cmd, args) => {
      const user = process.env.USER || process.env.USERNAME || 'root';
      const keep = ['DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'WAYLAND_DISPLAY', 'DISPLAY'];
      const prefixes = keep.filter((k) => (env || process.env)[k]).map((k) => `${k}=${(env || process.env)[k]}`);
      return spawn('sudo', ['-n', '-g', 'input', '-u', user, ...prefixes, cmd, ...args], {
        detached: true, stdio: 'ignore', env: env || process.env,
      });
    });
    this.profile = 'universal';
    this._enabled = false;
  }

  _prefixes() {
    const keep = ['DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'WAYLAND_DISPLAY', 'DISPLAY'];
    return keep.filter((k) => process.env[k]).map((k) => `${k}=${process.env[k]}`);
  }

  _call(args) {
    const r = spawnSync('sudo', ['-n', '-g', 'input', '-u', process.env.USER || process.env.USERNAME || 'root', ...this._prefixes(), 'key2touch', ...args], {
      encoding: 'utf8', timeout: 10000,
    });
    return {
      ok: !r.error && r.status === 0,
      stdout: String((r.stdout && r.stdout.toString()) || ''),
      stderr: String((r.stderr && r.stderr.toString()) || ''),
    };
  }

  async available() {
    const r = this._call(['status', '--json']);
    return { ok: !/not found|No such file/i.test(`${r.stdout}${r.stderr}`), raw: `${r.stdout}${r.stderr}` };
  }

  async status() {
    const r = this._call(['status', '--json']);
    try { return JSON.parse(r.stdout); } catch (_) { return { running: false, enabled: false }; }
  }

  async _ensureDaemon() {
    const s = await this.status();
    if (s.running) {
      // Keep the profile and scoping rules applied even when the daemon was
      // started earlier by another process.
      this._call(['profile', 'use', this.profile]);
      this._call(['set', 'only-focused', 'true', '-p', this.profile]);
      this._call(['window', 'add', 'waydroid.*', '-p', this.profile]);
      return true;
    }
    const child = this.spawner('key2touch', ['--hidden']);
    if (child && child.on) child.on('error', () => {});
    if (child && child.unref) child.unref();
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 250));
      // eslint-disable-next-line no-await-in-loop
      if ((await this.status()).running) return true;
    }
    return false;
  }

  async enable(profile) {
    if (profile) this.profile = profile;
    if (!await this._ensureDaemon()) return { ok: false, error: 'key2touch daemon did not start' };
    this._call(['profile', 'use', this.profile]);
    // KDE does not expose reliable window focus to key2touch, so a focus rule
    // leaves the mapping inactive even while the game is running. Mapping is
    // enabled only for the lifetime of an ApkStart game process instead.
    this._call(['set', 'only-focused', 'false', '-p', this.profile]);
    // Hide the on-screen buttons: the user wants physical keyboard control.
    this._call(['hide']);
    const r = this._call(['on']);
    this._enabled = /已开启|enabled|true/.test(`${r.stdout}${r.stderr}`) || r.ok;
    return { ok: this._enabled };
  }

  async disable() {
    this._call(['off']);
    this._enabled = false;
    return { ok: true };
  }

  get enabled() { return this._enabled; }
}

module.exports = { GameControls };
