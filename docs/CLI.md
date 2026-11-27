# ApkStart command line

ApkStart is available as a global `apkstart` command after `npm install -g .` or `bash scripts/install.sh`. The command uses the same settings, application records and runtime backends as the graphical window.

## Commands

| Command | Purpose |
| --- | --- |
| `apkstart` / `--help` / `-h` | Print the built-in help |
| `apkstart --install <apk...>` | Parse, install and create desktop launchers for one or more APK files |
| `apkstart --version` / `-V` | Print the version |
| `apkstart --list` | List installed applications by package, label and version |
| `apkstart --game <app>` | Launch a game with the universal controller enabled |
| `apkstart <app>` / `apkstart --launch <app>` | Launch by package name or by label |
| `apkstart --stop <app>` | Force-stop an application and release game controls |
| `apkstart --controls on [pkg]` / `off [pkg]` | Enable or release controller mapping globally or for one package |
| `apkstart --controls status` | Print the current mapping state as JSON |
| `apkstart --controls edit` | Open the controller layout editor as a desktop application |
| `apkstart --backend <id>` | Select `waydroid` (recommended on Linux), `builtin` or `atl` |
| `apkstart init [--backend <id>]` | Install and configure the dependencies of that backend |
| `apkstart init --check` | Report what is installed without changing anything |
| `apkstart verify <file.apk> [--cert SHA256]` | Verify APK v2 signature and optionally pin the signer certificate |
| `apkstart install` | Install the command globally, register file association and initialise |
| `apkstart --start-runtime` / `--stop-runtime` | Start or stop the selected runtime |
| `apkstart --gui` | Open the graphical window |

## Backend setup

`apkstart init` dispatches through `src/core/setup.js`. Adding a backend requires one registry entry and one setup script, so the initialiser never installs dependencies for a backend the user did not choose.

- `waydroid` (recommended on Linux, and picked automatically once installed) runs `scripts/setup-linux.sh`. It checks for a Wayland session and binder, installs Waydroid on Arch, Debian/Ubuntu, Fedora, openSUSE or Void, enables the container, prepares the image, configures multi-window mode and the soft keyboard, authorises the bundled adb key, installs `key2touch` where an AUR helper is available, and writes narrow, `visudo`-validated sudo rules for `lxc-unfreeze` and `key2touch`. Optional: `WAYDROID_GAPPS=1` (Google Play services image), `APKSTART_SKIP_CONTROLS=1`.
- `builtin` downloads the emulator and system image on first use; it needs no system packages. It is the fallback for X11, NVIDIA and ARM-only apps.
- `atl` runs `scripts/setup-atl.sh`, which builds the Android Translation Layer and its native dependencies from source. It is experimental and app compatibility varies.

The sudo rules are exact command whitelists, not blanket passwordless root. They allow ApkStart to thaw a frozen container and to manage game controls without an interactive prompt.

## Game controls

Touch-only games are played with `key2touch`, which reads host keyboard and mouse events and injects a virtual touchscreen into Waydroid. The default `universal` profile binds a WASD joystick, Space, Enter and left mouse button. The universal controller is disabled by default. Use `apkstart --game <app>` to opt in for a game; a detached watcher turns mapping off when the game exits. The profile binds a WASD joystick, a mouse-look area, left and right mouse buttons, Space, Enter, Q, E, R, Shift, Ctrl and the number keys 1–3. Left Ctrl frees the cursor when the look area has captured it, and F1 toggles mapping as a fallback. On-screen buttons are hidden so the physical keyboard is the input path. `apkstart --controls edit` opens the layout editor as a separate desktop application, F2 edits the layout inside a game, `apkstart --controls off` releases capture immediately, and `key2touch check -p universal --json` validates the profile.

An on-screen keyboard can be enabled from the settings page when a touch keyboard is preferred. The default is off so that the host keyboard is used.

<!-- apkstart-linux-origin -->
> Project origin: this is the Linux-focused build of ApkStart, which was originally created by RoutineMiku. The Linux runtime, command line,Waydroid/ATL backends and game controls are developed in this repository.
