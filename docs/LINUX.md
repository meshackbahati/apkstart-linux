# ApkStart on Linux

This document describes the Linux usage path: one click on an APK installs it, one click on the generated launcher opens the app, and the runtime stays light when no app is in the foreground.

## Requirements

- x86_64 Linux with a desktop session (X11 or Wayland) and `/dev/kvm` accessible to the user.
- Hardware virtualization enabled in firmware (Intel VT-x or AMD SVM). Without KVM the runtime falls back to software emulation, which boots but is too slow for games.
- `xdg-mime` is used for the APK file association when available. When it is absent, ApkStart writes `~/.config/mimeapps.list` directly.

The emulator and platform-tools are downloaded from Google on first use; the system image is platform-independent. Nothing is taken from a Windows installation.

## Daily use

1. Open ApkStart and enable **Associate .apk files** in the settings. ApkStart writes a `apkstart-apk.desktop` handler for `application/vnd.android.package-archive` and records the previous default handler so it can be restored later.
2. In the file manager, double-click any `.apk`, `.xapk` or `.apks`. The APK is parsed offline, installed into Android, and a `.desktop` launcher is written to both the desktop and `~/.local/share/applications`.
3. Click the app icon. The emulator window is the app window: it is positioned and sized by the emulator itself, with native mouse and keyboard input. Games use the same path; host GPU rendering is attempted first and software rendering is used as an automatic fallback.
4. Closing the app window returns the runtime to idle. It is shut down after five minutes by default, with the quickboot snapshot retained so the next launch is fast.

## Command line

The generated launchers call the same entry points as the Windows build:

```bash
ApkStart /path/to/app.apk          # install
ApkStart --launch com.example.game # launch
```

## Memory behaviour

The Linux defaults are deliberately conservative because the desktop session shares RAM with the guest:

| Setting | Linux default | Effect |
|---|---|---|
| Guest memory | 2048 MB automatic ceiling | About 1 GB less resident memory than the previous 3 GB profile, and a smaller snapshot |
| Guest vCPUs | 2 | Avoids starving the desktop session |
| Resource strategy | `save` | Applies both limits, with reduced rendering resolution |
| Prewarming | on | Applications open without waiting for a boot while the user is active |
| Panel shape | 1280×720 landscape | A desktop-shaped window instead of a portrait phone panel |
| Idle shutdown | 5 minutes | The runtime exits when no app is open |
| Background apps | one at a time by default | Opening another app force-stops the previous one, returning its memory |
| Snapshot | on | Disk trade-off only; it does not keep the emulator resident |

Manual values entered in settings always take precedence over these automatic ceilings. Users who want higher FPS in games can switch the resource strategy to `smooth` and disable the memory ceiling by entering an explicit memory value.

## Verification

The following was observed on an x86_64 host with accessible `/dev/kvm`, using an isolated data directory:

- `platform-tools 1.0.41` and `emulator 37.4.1.0` were downloaded from Google's Linux archives and unpacked with executable bits intact.
- `emulator -accel-check` returned `accel: 0` and `KVM (version 12) is installed and usable.`; ApkStart's probe resolved the same output to `kind: kvm`.
- Cold boot reached `sys.boot_completed=1`; `ro.product.cpu.abilist` reported `x86_64,arm64-v8a`, so ARM-only applications have a translation path.
- `assets/PinyinIME.apk` was parsed offline, installed through the same adb client (`Success`), resolved by `pm path`, and its launch activity was started with `am start`.
- Stopping the runtime produced a quickboot snapshot; the subsequent boot took about 63 seconds instead of a full cold boot.

## Waydroid backend (experimental)

For persistent application state and a lower memory footprint, the Linux build can use Waydroid instead of QEMU. Waydroid runs Android in a shared-kernel LXC container rather than a virtual machine, so there is no emulated CPU and no fixed 2 GB guest allocation. On the development host the container cgroup used about 620 MB of anonymous memory, 110 MB of kernel memory and 155 MB of shared graphics memory, approximately 0.9 GB active, while the QEMU profile reserves 2 GB. Application data in `/data` survives container restarts.

Prerequisites: a Wayland session, binder devices, a render node under `/dev/dri`, and a Waydroid installation with its container image initialised. Recent Arch kernels provide binder through `rust_binder`; Waydroid allocates `anbox-binder` itself and no manual `/dev/binder` symlinks should be created. NVIDIA proprietary drivers are not supported by Waydroid.

The backend is opt-in. Add the following to the settings file (`$XDG_DATA_HOME/apkstart/settings.json`, or `~/.local/share/apkstart/settings.json` by default):

```json
{
  "runtime": { "backend": "waydroid" }
}
```

ApkStart then connects to Waydroid's adb bridge using the bundled adb on its isolated server port, and launches applications through `waydroid app launch`. The default remains the self-contained QEMU runtime; no external runtime is ever selected automatically.

A one-time adb authorization is required on a fresh container. Copy the host public key into the guest and restart adbd:

```
sudo lxc-attach -P /var/lib/waydroid/lxc -n waydroid -- sh -c \
  'mkdir -p /data/misc/adb; cat > /data/misc/adb/adb_keys; chmod 600 /data/misc/adb/adb_keys; \
   chown shell:shell /data/misc/adb/adb_keys; kill -9 $(pidof adbd); setprop ctl.start adbd' \
  < ~/.android/adbkey.pub
```

The container must be unfrozen before `lxc-attach` will connect; `sudo lxc-unfreeze -P /var/lib/waydroid/lxc -n waydroid` resolves that.

### On-screen keyboard

Desktop users type on the host keyboard, so ApkStart keeps Android's on-screen keyboard hidden by default by writing `show_ime_with_hard_keyboard=0` to the guest secure settings after each start. The settings page contains an "On-screen keyboard" switch which writes the same setting when a touch keyboard is wanted. The preference is stored in `input.virtualKeyboard`.

### Window management limitation

Waydroid 1.6.3 runs all multi-window applications on one shared Android display. Each application receives its own top-level window, but the Android window manager draws the application inside a freeform rectangle on that display. Consequently the window close button and Alt+F4 are ignored, resizing the top-level window resizes the shared display rather than the application, and Android draws its own title bar. This is an upstream limitation documented in [waydroid issue #2470](https://github.com/waydroid/waydroid/issues/2470); the proposed fix, [android_hardware_waydroid PR #93](https://github.com/waydroid/android_hardware_waydroid/pull/93), does not change multi-window mode. ApkStart cannot correct this from outside the container. Applications can still be stopped reliably from the application list, which issues `am force-stop` and closes their window.

## Installation and first-run setup

Install the command globally and initialise the backend once:

```
npm install -g .
apkstart init --backend waydroid
apkstart init --check
```

`apkstart init` runs the setup module registered for the selected backend in `src/core/setup.js`. It never installs dependencies for a backend the user did not choose. The Waydroid module prepares the container, authorises the bundled adb key and configures keyboard-to-touch controls.

### Game controls

Touch-only games use `key2touch`, which reads host keyboard and mouse events and injects a virtual touchscreen into Waydroid. Control mapping is disabled by default because the universal layout was not effective in Moto Rush and an active mapper captures keys across the desktop. Enable it only with `apkstart --game <app>` or `apkstart --controls on <package>` after a game-specific layout has been verified. A detached watcher and the runtime watchdog release the mapping when the game exits, `apkstart --controls off` releases it immediately, and `apkstart --controls status` reports the current state. Press F2 inside a game to edit the control layout.

The on-screen keyboard switch described above is independent of game controls.

## Known limitations

- Automatic updates replace the AppImage in place by generating a POSIX shell script. The AppImage runtime sets `APPIMAGE`, which the updater uses as the replacement target. Extracted or package-manager installs have no single replaceable file, so they fall back to the **open download page** action.
- During verification, a full stop and restart of this QEMU AVD sometimes lost applications installed in the previous session. Keeping prewarming enabled avoids the restart during normal use. A shared-kernel Android container would be required for reliable per-application windows and state; that is a separate, larger effort.
- Window embedding (`SetParent`) is a Windows-only feature and is skipped on Linux; the emulator always uses its own window.
- `/dev/kvm` must be readable and writable. Most distributions require membership of the `kvm` group; log out and back in after adding the user.

<!-- apkstart-linux-origin -->
> Project origin: this is the Linux-focused build of ApkStart, which was originally created by RoutineMiku. The Linux runtime, command line,Waydroid/ATL backends and game controls are developed in this repository.
