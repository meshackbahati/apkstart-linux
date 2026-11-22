'use strict';
/**
 * Backend-aware initialisation.
 *
 * Each runtime backend owns one setup module. The CLI's `apkstart init`
 * dispatches to the module for the selected backend, so adding a backend later
 * only requires adding one entry here plus its setup script.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

const SETUPS = {
  builtin: {
    label: 'Self-contained Android emulator (QEMU)',
    script: '',
    detail: 'The runtime downloads itself on first launch; no system packages are required.',
  },
  waydroid: {
    label: 'Waydroid container (broad compatibility)',
    script: path.join(ROOT, 'scripts', 'setup-linux.sh'),
    detail: 'Installs Waydroid, prepares the container, authorises adb and configures keyboard-to-touch game controls.',
  },
  atl: {
    label: 'Android Translation Layer (native processes, experimental)',
    script: path.join(ROOT, 'scripts', 'setup-atl.sh'),
    detail: 'Builds ATL from source. Compatible apps start as ordinary Linux processes.',
  },
};

function list() {
  return Object.entries(SETUPS).map(([id, s]) => ({
    id, label: s.label, detail: s.detail,
    available: !s.script || fs.existsSync(s.script),
  }));
}

function which(cmd) {
  const r = spawnSync('sh', ['-c', `command -v ${cmd} || true`], { encoding: 'utf8' });
  return String((r.stdout && r.stdout.toString()) || '').trim();
}

/** Non-destructive status report used by `apkstart init --check`. */
function check() {
  // sudoers drop-ins are root-only; sudo -l reports the effective grants.
  const dir = spawnSync('sudo', ['-n', '-l'], { encoding: 'utf8' });
  const names = String((dir.stdout && dir.stdout.toString()) || '');
  return {
    platform: process.platform,
    waydroid: which('waydroid') || null,
    key2touch: which('key2touch') || null,
    atl: which('android-translation-layer') || null,
    sudoers: {
      unfreeze: names.includes('lxc-unfreeze'),
      key2touch: names.includes('/usr/bin/key2touch'),
    },
    backends: list(),
  };
}

function run(id, onLog = () => {}) {
  const setup = SETUPS[id];
  if (!setup) return { ok: false, error: `No setup module for backend "${id}"` };
  if (!setup.script) {
    onLog(setup.detail);
    return { ok: true, note: setup.detail };
  }
  if (!fs.existsSync(setup.script)) return { ok: false, error: `Setup script missing: ${setup.script}` };
  onLog(`Running ${setup.script}`);
  const r = spawnSync('bash', [setup.script], { stdio: 'inherit', env: process.env });
  return { ok: !r.error && r.status === 0, error: r.error ? r.error.message : '' };
}

module.exports = { SETUPS, list, check, run };
