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

For true per-application desktop windows and persistent application state, the Linux build can use Waydroid instead of QEMU. Waydroid runs Android in a shared-kernel LXC container, so each application is a normal Wayland or X11 window and `/data` survives restarts.

Prerequisites: a Wayland session, `/dev/binder` and `/dev/ashmem`, a render node under `/dev/dri`, and a Waydroid installation with its container image initialised. NVIDIA proprietary drivers are not supported by Waydroid.

The backend is opt-in. Add the following to the settings file (`$XDG_DATA_HOME/apkstart/settings.json`, or `~/.local/share/apkstart/settings.json` by default):

```json
{
  "runtime": { "backend": "waydroid" }
}
```

ApkStart then connects to Waydroid's adb bridge at `127.0.0.1:16384` using the bundled adb, and launches applications through `waydroid app launch`, which creates their native windows. The default remains the self-contained QEMU runtime; no external runtime is ever selected automatically.

## Known limitations

- Automatic updates replace the AppImage in place by generating a POSIX shell script. The AppImage runtime sets `APPIMAGE`, which the updater uses as the replacement target. Extracted or package-manager installs have no single replaceable file, so they fall back to the **open download page** action.
- During verification, a full stop and restart of this QEMU AVD sometimes lost applications installed in the previous session. Keeping prewarming enabled avoids the restart during normal use. A shared-kernel Android container would be required for reliable per-application windows and state; that is a separate, larger effort.
- Window embedding (`SetParent`) is a Windows-only feature and is skipped on Linux; the emulator always uses its own window.
- `/dev/kvm` must be readable and writable. Most distributions require membership of the `kvm` group; log out and back in after adding the user.
