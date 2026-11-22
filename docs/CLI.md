# ApkStart command line

ApkStart is available as a global `apkstart` command after `npm install -g .` or `bash scripts/install.sh`. The command uses the same settings, application records and runtime backends as the graphical window.

## Commands

| Command | Purpose |
| --- | --- |
| `apkstart --install <apk...>` | Parse, install and create desktop launchers for one or more APK files |
| `apkstart --version` | Print the version |
| `apkstart --list` | List installed applications by package, label and version |
| `apkstart --game <app>` | Launch a game with the universal controller enabled |
| `apkstart <app>` / `apkstart --launch <app>` | Launch by package name or by label |
| `apkstart --stop <app>` | Force-stop an application and release game controls |
| `apkstart --controls edit` | Open the controller layout editor as a desktop application |
| `apkstart --backend <id>` | Select `builtin`, `waydroid` or `atl` |
| `apkstart init [--backend <id>]` | Install and configure the dependencies of that backend |
| `apkstart init --check` | Report what is installed without changing anything |
| `apkstart install` | Install the command globally, register file association and initialise |
| `apkstart --start-runtime` / `--stop-runtime` | Start or stop the selected runtime |
| `apkstart --gui` | Open the graphical window |

## Backend setup

`apkstart init` dispatches through `src/core/setup.js`. Adding a backend requires one registry entry and one setup script, so the initialiser never installs dependencies for a backend the user did not choose.

- `builtin` downloads the emulator and system image on first use; it needs no system packages.
- `waydroid` runs `scripts/setup-linux.sh`: installs Waydroid, enables the container, prepares the image, configures multi-window mode and the soft keyboard, authorises the bundled adb key, installs `key2touch`, and writes narrow sudo rules for `lxc-unfreeze` and `key2touch`.
- `atl` runs `scripts/setup-atl.sh`, which builds the Android Translation Layer and its native dependencies from source. It is experimental and app compatibility varies.

The sudo rules are exact command whitelists, not blanket passwordless root. They allow ApkStart to thaw a frozen container and to manage game controls without an interactive prompt.

## Game controls

Touch-only games are played with `key2touch`, which reads host keyboard and mouse events and injects a virtual touchscreen into Waydroid. The default `universal` profile binds a WASD joystick, Space, Enter and left mouse button. The universal controller is enabled by default when an application is launched, and its on-screen HUD is shown so the controls are visible during play. `apkstart --game <app>` is the explicit game launcher and guarantees the mapping is enabled; `apkstart --controls edit` opens the layout editor as a separate desktop application. A detached watcher turns mapping off when the game exits, `apkstart --stop` does so immediately, and `apkstart --controls off` releases it at any moment. Press F2 inside a game or run `apkstart --controls edit` to edit the layout, and use `key2touch check -p universal --json` to validate it.

An on-screen keyboard can be enabled from the settings page when a touch keyboard is preferred. The default is off so that the host keyboard is used.

<!-- apkstart-linux-origin -->
> Project origin: this is the Linux-focused build of ApkStart, which was originally created by RoutineMiku. The Linux runtime, command line,Waydroid/ATL backends and game controls are developed in this repository.
