# ApkStart Linux

[![CI](https://github.com/meshackbahati/apkstart-linux/actions/workflows/ci.yml/badge.svg)](https://github.com/meshackbahati/apkstart-linux/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/meshackbahati/apkstart-linux?include_prereleases&sort=semver)](https://github.com/meshackbahati/apkstart-linux/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20x64-3C9.svg)](#requirements)

Run Android applications as ordinary desktop applications on Linux. Double-click
an APK to install it, click its launcher to open it in a dedicated window, and
let the Android runtime become idle when no application is in the foreground.

This repository is the Linux-focused fork of
[RoutineMiku/apkstart](https://github.com/RoutineMiku/apkstart). The original
project design comes from RoutineMiku; the Linux runtime, command line,
Waydroid and ATL backends, game controls and Linux packaging are developed here.

This README is the single entry point for installation, daily use, networking,
release procedures and verification. Smaller documents under `docs/` cover
specific implementation details only.

## Contents

1. [Why it exists](#why-it-exists)
2. [Interface](#interface)
3. [Requirements](#requirements)
4. [Installation](#installation)
5. [One-time setup](#one-time-setup)
6. [Daily use](#daily-use)
7. [Windows and input](#windows-and-input)
8. [Networking and DNS](#networking-and-dns)
9. [Files and data](#files-and-data)
10. [Diagnostics and repair](#diagnostics-and-repair)
11. [Updates](#updates)
12. [Recommended settings](#recommended-settings)
13. [Releasing](#releasing)
14. [Development and tests](#development-and-tests)
15. [Design boundaries](#design-boundaries)
16. [Credits and licence](#credits-and-licence)

## Why it exists

| Alternative | Typical experience | ApkStart Linux |
|---|---|---|
| Android Studio emulator | Several gigabytes, manual AVD and port setup | One-click runtime deployment, then drag in an APK |
| Third-party PC emulator | All apps inside one large window | One desktop launcher and one window per application |
| Cloud phone | Network dependent, high latency, unclear data ownership | Fully local; application data stays on the host |
| Manual `adb install` | A terminal for every install and launch | Double-click install, click-to-launch, idle shutdown |

## Interface

<p align="center"><img src="docs/screenshots/ui-main/00-landing.png" alt="Application grid" width="760" /></p>

The status bar reports runtime readiness, Android version, device and port, and
any actionable fix count. Settings are grouped into nine searchable categories:
Common & Install, Display & Window, Input & Controls, Performance & Resources,
Network & Downloads, Diagnostics & Repair, Integration & Files, Update & About,
and Lab.

<p align="center"><img src="docs/screenshots/ui-performance/02-step.png" alt="Performance settings" width="760" /></p>

The captures under `docs/screenshots/` come from the real renderer with stubbed
IPC data. They show interface states, not live Android sessions: no emulator
boot, installation, network request or user directory is involved. Each
directory contains PNG captures and an empty console log, which means the
renderer produced no script errors.

To regenerate them, build the fixture and serve it locally:

```bash
npm run docs:fixture
cd test/out/ui-fixture && python3 -m http.server 8765 --bind 127.0.0.1
```

Then capture states with the browser helper:

```bash
pwshot http://127.0.0.1:8765/index.html --out docs/screenshots/ui-main --wait 1500
pwshot http://127.0.0.1:8765/index.html --out docs/screenshots/ui-performance \
  --wait 1200 \
  --click '#btnSettings' --click '#setNav .set-nav-item[data-cat="perf"]' \
  --fill '' --fill ''
```

The tool lives at `tools/ui-screenshot-fixture.js`. When a setting is added to
the UI, add its default to the fixture so the screenshot still renders the real
control. A screenshot proves that a state renders; it does not prove that a
backend works or that an APK installs. Those claims require `npm run test:boot`
and `npm run selftest` on a host with KVM.

## Requirements

| Requirement | Why it matters | How to check |
|---|---|---|
| x86_64 Linux with X11 or Wayland | The packaged runtime is built for x86_64 only; Linux ARM64 has no official Android Emulator archive | `uname -m` |
| Hardware virtualisation enabled (VT-x or AMD SVM) | Without KVM the guest falls back to software emulation, which boots but is too slow for games | `grep -E 'vmx\|svm' /proc/cpuinfo` |
| Accessible `/dev/kvm` | The emulator needs read/write access to the KVM device | `test -r /dev/kvm && test -w /dev/kvm && echo ok` |
| Membership of the `kvm` group | Most distributions restrict `/dev/kvm` to that group | `groups \| grep kvm` |
| At least 8 GB RAM, 16 GB recommended | The guest is capped at 2 GB and 2 vCPUs by default, but the desktop still needs memory | `free -h` |
| About 8 GB free disk | The runtime, Android image and quickboot snapshot share one directory | `df -h` |

Add the current user to `kvm` if the check fails, then log out and back in:

```bash
sudo usermod -aG kvm "$USER"
```

`xdg-mime` is used for `.apk` association when present. When it is absent,
ApkStart writes `~/.config/mimeapps.list` directly, so no extra package is
needed for file association.

## Installation

Releases publish an AppImage and a Debian package. Both contain only the
ApkStart code and the Electron runtime. The Android emulator, adb and the
system image are downloaded from Google on first use and stored outside the
application directory, so updating the application never removes installed
apps or snapshots.

### AppImage

```bash
chmod +x ApkStart-*-x86_64.AppImage
./ApkStart-*-x86_64.AppImage
```

The updater replaces the AppImage in place: it reads the `APPIMAGE` environment
variable set by the AppImage runtime. Keep the original file name and location
if automatic updates are wanted.

### Debian / Ubuntu

```bash
sudo apt install ./ApkStart-*-amd64.deb
apkstart --version
```

A package-manager install has no single replaceable file, so automatic updates
fall back to opening the download page. Download the new package and install it
over the old one to upgrade.

### From source

Node.js 20 or newer is required; CI uses 22.

```bash
git clone https://github.com/meshackbahati/apkstart-linux.git
cd apkstart-linux
npm install
npm start
```

To install the global `apkstart` command and register desktop files:

```bash
npm install -g .
# or, for a script that also creates launcher entries:
bash scripts/install.sh
```

Verify the installation without starting the GUI or downloading anything:

```bash
apkstart --version
apkstart --help
apkstart init --check
apkstart --list
```

## One-time setup

1. Start ApkStart and open **Settings → Common & Install**. Enable **Associate
   .apk files**. The handler is registered for
   `application/vnd.android.package-archive`, and the previous default is
   recorded so it can be restored later.
2. Open **Settings → Common & Install → One-click setup** (or run
   `apkstart --start-runtime`). ApkStart downloads and verifies adb, the
   Android Emulator and the Android 14 Google Play x86_64 image, boots the guest
   once and saves a quickboot snapshot. On a normal connection this takes one to
   three minutes. The runtime lives in `~/.local/share/apkstart/runtime`,
   outside the application directory.
3. Confirm readiness in the status bar. It should read "Runtime is ready" with
   the Android version and a device entry such as `emulator-5554`. A successful
   dependency check does not prove that Android booted; only an adb device that
   reports `sys.boot_completed=1` does.

### Backends

The default `builtin` backend is self-contained. Two Linux alternatives are
opt-in and must be initialised explicitly:

```bash
apkstart init --backend waydroid   # shared-kernel container, about 0.9 GB resident
apkstart init --backend atl        # experimental native processes
apkstart --backend waydroid        # select it for daily use
apkstart init --check              # report dependency state
```

| Backend | Id | What it runs | When to choose it |
|---|---|---|---|
| Self-contained emulator | `builtin` | Google Android Emulator, KVM accelerated, x86_64 Android 14 image with ARM translation | General use, games, apps that need Google Play |
| Waydroid container | `waydroid` | Android in a shared-kernel LXC container | Lower resident memory, persistent app state, Wayland desktops with binder and `/dev/dri` |
| Android Translation Layer | `atl` | Native Linux processes derived from the APK | Experimental; only APKs without Google Play, DRM, FCM or Binder dependencies |

Waydroid needs a Wayland session, binder devices and a render node under
`/dev/dri`. NVIDIA proprietary drivers are not supported by Waydroid. Its setup
script configures adb authorisation, a narrow sudo rule for idle thawing and
keyboard-to-touch controls. Waydroid 1.6.3 draws its own title bar and ignores
window close on multi-window apps; stop the app from the application list
instead. ATL requires a source build, and its framework implementations are
incomplete; games with OpenGL or Binder dependencies may not run.

### First application

Double-click an `.apk`, `.xapk` or `.apks` in the file manager, or run:

```bash
apkstart --install ~/Downloads/app.apk
```

ApkStart parses the package offline, checks the data partition and free disk
space, installs it, writes a `.desktop` launcher to the desktop and to
`~/.local/share/applications`, then records its metadata. Click the launcher to
open the application in its own emulator window.

## Daily use

The application grid shows each installed app with its icon extracted from the
APK. Click a card to launch; right-click for desktop shortcut, pin, reveal APK,
clear data, uninstall and per-app orientation. The top field filters by label or
package, and **Install APK** opens a file picker that also accepts drag and drop.

```bash
apkstart --install ~/Downloads/app.apk     # install one or more packages
apkstart com.example.app                   # launch by package or label
apkstart --launch com.example.app          # explicit launch form
apkstart --game com.example.app            # launch with key-to-touch enabled
apkstart --stop com.example.app            # force-stop the application
apkstart --controls on <package>           # enable controls for one package
apkstart --controls off                    # release capture immediately
apkstart --controls status                 # show mapping state as JSON
apkstart --controls edit                   # open the layout editor
apkstart --start-runtime                   # boot the guest and report readiness
apkstart --stop-runtime                    # shut the runtime down
apkstart --list                            # list installed applications
apkstart --gui                             # open the graphical window
```

The full flag reference, including `init --backend` and environment variables,
is in [CLI.md](docs/CLI.md).

The installer handles split bundles with `install-multiple` and ARM-only
packages through the translation layer in the Android 14 Google Play image. If
that capability is missing, ApkStart switches the image and retries instead of
reporting a generic failure. Launches are serialized: repeated clicks queue
rather than starting two runtime sessions. Permissions are granted, orientation
is locked to the value learned from the manifest or the running activity, and
the splash stays until the first frame is drawn.

Closing the last window returns the runtime to idle. After five minutes by
default it shuts down while keeping the quickboot snapshot. Prewarming keeps the
guest ready while applications are in use, so subsequent launches are usually a
few seconds.

## Windows and input

Linux uses the emulator's own top-level window. `SetParent` embedding is a
Windows-only feature and is skipped. The panel shape is 1280×720 landscape by
default on Linux, which suits a desktop window better than a portrait phone
panel. Per-app orientation overrides are remembered.

Input is native: host keyboard and mouse go to the emulator window. Settings →
Input & Controls can map the right mouse button to Android BACK, coalesce wheel
bursts into a single swipe, and map side buttons to BACK/FORWARD. On Linux these
mappings are driven by the persistent adb input channel, not by a global Windows
hook.

Touch-only games use the `key2touch` daemon through the Waydroid backend. It is
disabled by default because the universal layout is not verified for every game
and an active mapper captures keys across the desktop. Use `apkstart --game
<app>` to opt in for one game; a detached watcher releases capture when the game
exits. Press F2 in a game to edit the layout, or use `apkstart --controls edit`.
An on-screen keyboard can be enabled in settings when a touch keyboard is
preferred; the default is off so the host keyboard is used.

## Networking and DNS

The guest uses QEMU user-mode NAT. Outbound traffic reuses the host network
stack; no virtual adapter, bridge or driver is created. ApkStart's adb server
runs on an isolated port so external adb clients do not contend for the device.

Settings → Performance and Resources → **DNS server** chooses what the emulator
passes to the guest through `-dns-server`:

| Preset | Servers | When to use |
|---|---|---|
| Domestic (default) | `223.5.5.5,119.29.29.29` | Fast resolution on domestic networks and when a VPN or corporate resolver is slow |
| Cloudflare | `1.1.1.1,1.0.0.1` | Networks where domestic resolvers are filtered |
| Google | `8.8.8.8,8.8.4.4` | Networks with unrestricted access to Google DNS |
| Off | none | Intranet names that only the host resolver knows; the guest keeps using 10.0.2.3 |

The setting takes effect on the next runtime start. Configurations from before
0.6.4 store only `engine.fastDns` and are interpreted as domestic or off without
a migration step. An unknown value falls back to the domestic preset.

## Files and data

`~/ApkStartShared` is synchronised bidirectionally with
`/sdcard/ApkStartShared`. Synchronisation is incremental, based on mtime and
size, and runs while an application window is active. Conflicting files are
kept as copies rather than silently overwritten. Both directories can be
changed in Settings → Integration & Files, which also shows disk usage and
offers cleanup of old images, stale snapshots, locks and leftover directories.

The runtime directory, AVD data and shared directory are independent of the
application installation, so an update or reinstall does not remove installed
apps. To remove ApkStart completely:

```bash
node scripts/assoc.js off          # restore the previous .apk handler
npm uninstall -g apkstart
rm -rf ~/.local/share/apkstart ~/.local/share/applications/apkstart-apk.desktop
```

The last command deletes installed applications, snapshots and shared state.

## Diagnostics and repair

Settings → Diagnostics & Repair contains hardware preflight, JSON driver
patches and the periodic auto-check. The auto-check runs every ten minutes by
default and groups findings by runtime, device, storage, settings, network and
logs. Probe failures are reported as "unknown" rather than as problems, and only
new problems raise a notification. Most findings have a one-click repair action;
where no action is implemented, the UI says so.

```bash
npm run test:boot    # real QEMU boot test with an Alpine guest
npm run selftest     # install → launch → screenshot → shared folder
```

## Updates

Settings → Update & About checks GitHub Releases for this fork. AppImage
installations are replaced in place with a POSIX script that waits for the
application to exit, verifies the replacement and rolls back on failure.
Package-manager installs open the download page instead. Update payloads are
verified before adoption, and an interrupted update resumes on the next launch.

## Recommended settings

| Goal | Setting |
|---|---|
| Lowest memory use | Resource strategy `save`, prewarming off, snapshot off if disk is tight |
| Fast app opening | Keep prewarming and snapshot on; the guest stays resident while apps are in use |
| Games | Resource strategy `smooth`, explicit memory value above the automatic 2 GB ceiling, host GPU rendering |
| Corporate or VPN network | DNS preset `off` for intranet names, or `Cloudflare` if the corporate resolver is slow |
| No autostart | Disable "Start with the system" in Settings → Common & Install; it is enabled by default |
| Waydroid | Select the backend with `apkstart --backend waydroid` after `apkstart init --backend waydroid` |

## Releasing

Releases are produced by `.github/workflows/release.yml`. `package.json` is the
single source of the version number, and a tag must be `v` followed by that
exact version, for example `v0.6.4` for version `0.6.4`. Notes may be placed in
`.github/release-notes-<tag>.md`; when present they are used verbatim.

The pipeline has three jobs:

1. **verify** runs on Ubuntu with Node 22: `npm ci`, the full `npm test` chain,
   shell and Python syntax checks, the UI screenshot fixture build, and four
   CLI smoke commands.
2. **build-linux** depends on verify. It builds an AppImage with
   `npm run pack:linux` and a Debian package with electron-builder, writes
   `SHA256SUMS` with bare file names in `dist/release`, checks that the tag
   matches `package.json`, and uploads the three files as one artifact.
3. **publish** downloads the artifact, re-verifies every checksum with
   `sha256sum -c`, creates the release if it does not exist, and uploads the
   AppImage, `.deb` and checksum file with `gh release upload --clobber`.

Only the default `GITHUB_TOKEN` is required; no Gitee token, signing key or
telemetry endpoint is part of the pipeline. The publish job runs only for a
`v*` tag push or when `workflow_dispatch` is given an existing tag. Re-running a
tag updates assets in place rather than creating a second release.

For a manual build:

```bash
npm test
npm run pack:linux
npx electron-builder --linux deb --publish never --config electron-builder.yml
git tag v0.6.4
git push origin v0.6.4
```

Automated gates prove that the source passes unit tests, the UI fixture renders
without script errors, the CLI starts without Electron, and built assets match
their checksums. They do not prove installation on every distribution, a real
KVM boot, or application compatibility. Record those checks separately in the
release notes when they were performed.

| Asset | Built by | Notes |
|---|---|---|
| `ApkStart-<version>-x86_64.AppImage` | `npm run pack:linux` | Runtime downloaded on first use |
| `ApkStart-<version>-amd64.deb` | `electron-builder --linux deb` | Updates open the download page |
| `SHA256SUMS` | `sha256sum` in `dist/release` | Bare names, verified before upload |

## Development and tests

```bash
npm test                # pure-Node regression suite, 26 scripts
npm run test:ui         # real Electron settings smoke (requires Electron)
npm run test:boot       # real QEMU boot test with an Alpine guest
npm run selftest        # install → launch → screenshot → shared folder
npm run pack:linux      # build the AppImage
npm run docs:fixture    # build the screenshot fixture
```

The default `npm test` chain runs 26 Node scripts, including the DNS preset
suite. The shell has no runtime dependency except `@napi-rs/lzma`. All ZIP,
AXML, ARSC, PNG, ICO, ext4 and download logic is hand-written on Node built-ins.

## Design boundaries

ApkStart is not a hypervisor. Android's kernel, ART runtime and GPU translation
come from AOSP, QEMU, adb and Google's system image; this project owns the
installation, window presentation, runtime management, sharing and update
experience.

- Linux ARM64 is not supported because no official emulator archive exists for
  that host.
- Window embedding is Windows-only; Linux uses a separate emulator window.
- Waydroid's multi-window mode shares one Android display and ignores window
  close; stop the app from the application list instead.
- Game controls require a verified per-game layout; the universal layout is not
  guaranteed to work.
- Application compatibility still depends on ABI, Google Play dependencies,
  hardware features and anti-emulation checks.
- Runtime downloads follow their upstream licences; the project code is MIT
  licensed.

For Windows-derived background material, see
[USER-MANUAL.md](docs/USER-MANUAL.md), [LINUX.md](docs/LINUX.md),
[SPECIFICATIONS.md](docs/SPECIFICATIONS.md) and [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Credits and licence

Original project by [RoutineMiku](https://github.com/RoutineMiku/apkstart).
Linux fork maintained at
[meshackbahati/apkstart-linux](https://github.com/meshackbahati/apkstart-linux).

[MIT](LICENSE). Release packages contain ApkStart's own code and the Electron
runtime; Android images, QEMU binaries and Google components are downloaded by
the user on first use under their respective licences.
