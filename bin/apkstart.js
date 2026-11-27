#!/usr/bin/env node
'use strict';
/**
 * Command line front door for ApkStart.
 *
 * The Electron window remains the graphical interface, but installing and
 * launching applications must not require a mouse. These commands use the same
 * core modules as the GUI, so settings, app records and the selected runtime
 * backend are shared between the two interfaces.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const store = require(path.join(ROOT, 'src/core/store'));
const { Runtime } = require(path.join(ROOT, 'src/core/engine'));
const { Installer } = require(path.join(ROOT, 'src/core/installer'));
const { parseApk } = require(path.join(ROOT, 'src/core/apk'));
const setup = require(path.join(ROOT, 'src/core/setup'));

function context() {
  const desktop = process.env.XDG_DESKTOP_DIR
    || (process.platform === 'win32' ? path.join(os.homedir(), 'Desktop') : path.join(os.homedir(), 'Desktop'));
  return {
    launcherTarget: process.execPath,
    launcherArgs: `"${__filename}"`,
    cwd: ROOT,
    isDev: false,
    desktopDir: desktop,
    startMenuDir: process.platform === 'linux'
      ? path.join(os.homedir(), '.local', 'share', 'applications') : '',
  };
}

function make() {
  const runtime = new Runtime(ROOT);
  return { runtime, installer: new Installer(runtime, context()) };
}

function findApp(name) {
  const key = String(name || '').toLowerCase();
  const apps = store.getApps();
  return apps.find((a) => a.package === name)
    || apps.find((a) => String(a.label || '').toLowerCase() === key)
    || apps.find((a) => String(a.label || '').toLowerCase().includes(key))
    || apps.find((a) => String(a.package || '').toLowerCase().includes(key)) || null;
}

const HELP = `ApkStart - run Android applications on the Linux desktop

Usage:
  apkstart --install <file.apk> [...]   install one or more APK files
                                        (--force installs even if ATL reports it cannot run)
  apkstart --version                    print the version
  apkstart --list                       list installed applications
  apkstart --game <app>                 launch a game with the universal controller
  apkstart <app>                        launch by name or package
  apkstart --launch <app>               same as above
  apkstart --stop <app>                 stop a running application
  apkstart --backend <builtin|waydroid|atl> select the runtime backend
  apkstart init [--backend <id>]        install and configure that backend
  apkstart init --check                 report what is installed
  apkstart install                      install apkstart globally and initialise
  apkstart --start-runtime              start the selected runtime now
  apkstart --controls on|off|status|edit  manage keyboard-to-touch game mapping
  apkstart --stop-runtime               stop the runtime and free its memory
  apkstart verify <file.apk> [--cert SHA256]  verify an APK's v2 signature
  apkstart atl-check <file.apk> [--json]      check offline whether an APK can run on ATL
  apkstart --gui                        open the graphical interface
  apkstart --help                       show this message

Examples:
  apkstart --install ~/Downloads/fdroid.apk
  apkstart f-droid
  apkstart org.fdroid.fdroid
`;

async function install(argv) {
  const force = argv.includes('--force');
  const files = argv.filter((a) => a !== '--force');
  if (!files.length) throw new Error('--install needs at least one APK path');
  const { installer } = make();
  for (const raw of files) {
    const file = path.resolve(raw.replace(/^~/, os.homedir()));
    if (!fs.existsSync(file)) throw new Error(`APK not found: ${file}`);
    process.stdout.write(`Installing ${path.basename(file)}\n`);
    // eslint-disable-next-line no-await-in-loop
    const meta = parseApk(file);
    await installer.install(file, (p) => {
      if (p && p.message) process.stdout.write(`  ${p.message}\n`);
    }, { force });
    process.stdout.write(`Installed ${meta.package}\n`);
  }
}

async function launch(name) {
  const app = findApp(name);
  if (!app) throw new Error(`Application not installed: ${name}. Run "apkstart --list".`);
  const { installer } = make();
  process.stdout.write(`Launching ${app.label || app.package}\n`);
  await installer.launch(app.package, {
    onLog: (m) => process.stdout.write(`  ${m}\n`),
  });
}

async function game(name) {
  const app = findApp(name);
  if (!app) throw new Error(`Application not installed: ${name}. Run "apkstart --list".`);
  store.upsertApp({ package: app.package, touchControls: true });
  store.saveSettings({ input: { touchControls: true } });
  const { GameControls } = require(path.join(ROOT, 'src/core/gamecontrols'));
  const c = new GameControls();
  await c.enable().catch(() => {});
  process.stdout.write(`Launching ${app.label || app.package} with universal controller\n`);
  await launch(app.package);
}

async function stop(name) {
  const app = findApp(name);
  if (!app) throw new Error(`Application not installed: ${name}`);
  const { runtime } = make();
  const rt = await runtime.ensure();
  if (!rt.ok) throw new Error(rt.error || 'runtime unavailable');
  await rt.client.forceStop(app.package);
  if (runtime.backend && typeof runtime.backend.stopApp === 'function') await runtime.backend.stopApp(app.package);
  process.stdout.write(`Stopped ${app.package}\n`);
}

function list() {
  const apps = store.getApps();
  if (!apps.length) {
    process.stdout.write('No applications installed. Use: apkstart --install <file.apk>\n');
    return;
  }
  for (const a of apps) {
    process.stdout.write(`${a.package}\t${a.label || ''}\t${a.versionName || ''}\n`);
  }
}

function backend(id) {
  if (['builtin', 'waydroid', 'atl'].indexOf(id) < 0) throw new Error('Backend must be builtin, waydroid or atl');
  store.saveSettings({ runtime: { backend: id } });
  process.stdout.write(`Runtime backend: ${id}\n`);
}

function init(args) {
  if (args.includes('--check')) {
    process.stdout.write(`${JSON.stringify(setup.check(), null, 2)}\n`);
    return undefined;
  }
  const at = args.indexOf('--backend');
  const wanted = at >= 0 ? args[at + 1] : null;
  const backend = wanted || (store.getSettings().runtime || {}).backend
    || (process.platform === 'linux' ? 'waydroid' : 'builtin');
  process.stdout.write(`Initialising backend: ${backend}\n`);
  const r = setup.run(backend, (m) => process.stdout.write(`${m}\n`));
  if (!r.ok) throw new Error(r.error || 'setup failed');
  return undefined;
}

function globalInstall() {
  const script = path.join(ROOT, 'scripts', 'install.sh');
  const r = spawnSync('bash', [script], { stdio: 'inherit', env: process.env });
  if (r.error || r.status !== 0) throw new Error((r.error && r.error.message) || 'global install failed');
  return undefined;
}

async function controls(action) {
  const { GameControls } = require(path.join(ROOT, 'src/core/gamecontrols'));
  const c = new GameControls();
  const target = process.argv[process.argv.indexOf('--controls') + 2];
  if (action === 'on') {
    if (target) store.upsertApp({ package: target, touchControls: true });
    const r = await c.enable();
    process.stdout.write(r.ok ? 'Game controls on\n' : `Could not enable controls: ${r.error}\n`);
    if (!r.ok) process.exitCode = 1;
    return;
  }
  if (action === 'off') {
    if (target) store.upsertApp({ package: target, touchControls: false });
    await c.disable();
    process.stdout.write('Game controls off\n');
    return;
  }
  if (action === 'edit') {
    const r = await c._ensureDaemon();
    if (!r) throw new Error('key2touch daemon did not start');
    c._call(['edit']);
    process.stdout.write('Controller settings opened\n');
    return;
  }
  if (action === 'status' || !action) {
    process.stdout.write(`${JSON.stringify(await c.status())}\n`);
    return;
  }
  throw new Error('Use on, off or status');
}

function gui() {
  const { spawn } = require('child_process');
  const electron = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
  const child = spawn(electron, [ROOT], { detached: true, stdio: 'ignore', env: process.env });
  child.unref();
  process.stdout.write('ApkStart window opened\n');
}

(async () => {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === '--help' || cmd === '-h') { process.stdout.write(HELP); return; }
  if (cmd === '--version' || cmd === '-V') {
    process.stdout.write(`${require(path.join(ROOT, 'package.json')).version}\n`);
    return undefined;
  }
  if (cmd === '--install') return install(argv.slice(1));
  if (cmd === '--list') return list();
  if (cmd === '--launch') {
    if (!argv[1]) throw new Error('--launch needs an application name');
    return launch(argv[1]);
  }
  if (cmd === '--stop') {
    if (!argv[1]) throw new Error('--stop needs an application name');
    return stop(argv[1]);
  }
  if (cmd === '--backend') {
    if (!argv[1]) throw new Error('--backend needs builtin or waydroid');
    return backend(argv[1]);
  }
  if (cmd === '--start-runtime') {
    const { runtime } = make();
    const rt = await runtime.ensure();
    if (!rt.ok) throw new Error(rt.error || 'runtime unavailable');
    process.stdout.write(`Runtime ready (${rt.backend || rt.engine})\n`);
    return undefined;
  }
  if (cmd === '--stop-runtime') {
    const { runtime } = make();
    const ok = await runtime.stop();
    process.stdout.write(ok ? 'Runtime stopped\n' : 'Runtime was not running\n');
    return undefined;
  }
  if (cmd === 'verify') {
    const file = argv[1] && path.resolve(argv[1].replace(/^~/, os.homedir()));
    if (!file || !fs.existsSync(file)) throw new Error('verify needs an existing APK path');
    const { readSigner, verifyV2 } = require(path.join(ROOT, 'src/core/apksig'));
    const at = argv.indexOf('--cert');
    const expected = at >= 0 ? argv[at + 1] : null;
    const signer = readSigner(file);
    const result = verifyV2(file, expected);
    process.stdout.write(`${path.basename(file)}: ${result.ok ? 'signature valid' : `signature invalid (${result.reason})`}\n`);
    if (signer) process.stdout.write(`signer ${signer.scheme}: ${signer.certSha256}\n`);
    if (!result.ok) process.exitCode = 1;
    return undefined;
  }
  if (cmd === 'atl-check') {
    const files = argv.slice(1).filter((a) => a !== '--json');
    if (!files.length) throw new Error('atl-check needs one or more APK paths');
    const atlcompat = require(path.join(ROOT, 'src/core/atlcompat'));
    const results = files.map((f) => atlcompat.checkApk(path.resolve(f.replace(/^~/, os.homedir()))));
    if (argv.includes('--json')) {
      process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    } else {
      for (const r of results) process.stdout.write(`${path.basename(r.file)}\n${atlcompat.describe(r)}\n\n`);
    }
    if (results.some((r) => r.verdict === 'blocked' || r.verdict === 'unknown')) process.exitCode = 1;
    return undefined;
  }
  if (cmd === 'init') return init(argv.slice(1));
  if (cmd === 'install') return globalInstall();
  if (cmd === '--game') {
    if (!argv[1]) throw new Error('--game needs an application name');
    return game(argv[1]);
  }
  if (cmd === '--controls') return controls(argv[1]);
  if (cmd === '--gui') return gui();
  if (cmd.startsWith('--')) throw new Error(`Unknown option: ${cmd}`);
  return launch(cmd);
})().catch((e) => {
  process.stderr.write(`error: ${e && e.message ? e.message : e}\n`);
  process.exitCode = 1;
});
