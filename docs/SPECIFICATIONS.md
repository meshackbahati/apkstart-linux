# Specifications and limitations

This document describes the current Linux build (version 0.6.3) and its measured limits.

## Host requirements

| Item | Requirement |
| --- | --- |
| Architecture | x86_64 |
| Desktop | Wayland session (KDE Plasma verified) |
| Kernel | Linux with binder support; Arch `rust_binder` works without manual device nodes |
| Graphics | `/dev/dri/renderD128` or equivalent render node |
| Optional | `/dev/kvm` for the self-contained QEMU backend |

## Backends

| Backend | Id | Resident memory | Compatibility | Window model |
| --- | --- | --- | --- | --- |
| Self-contained emulator | `builtin` | 2 GB guest budget | Broad, including ARM translation | One emulator surface |
| Waydroid container | `waydroid` | about 0.9 GB active (620 MB anonymous, 110 MB kernel, 155 MB shared graphics) | Broad, games work | One top-level window per app on one shared Android display |
| Android Translation Layer | `atl` | process-only | App by app, experimental | Native Linux process and window |

The default remains `builtin`; select another backend with `apkstart --backend <id>` and initialise it with `apkstart init --backend <id>`.

## Known limitations

1. Waydroid 1.6.3 multi-window mode shares one Android display. Resizing a top-level window resizes that display rather than the application, and the window close button is ignored. This is upstream behaviour (waydroid/waydroid#2470); the proposed hardware composer fix does not change multi-window mode. Force-stopping the application from ApkStart does close its window.
2. The Waydroid container freezes when idle, which pauses adb. The backend unfreezes it automatically through a narrow passwordless sudo rule.
3. ATL needs a source build and its framework implementations are incomplete. Games with OpenGL or Binder dependencies may not run.
4. The English UI uses exact translations plus a glossary fallback. A small number of composite strings may read imperfectly.
5. key2touch is restricted to focused Waydroid windows through `only-focused` and a `waydroid.*` rule. Use `apkstart --controls off` immediately if keyboard input is captured outside a game.
6. Guest state under the QEMU backend depends on the quickboot snapshot and is not covered by the same persistence guarantees as Waydroid's `/data`.

## Game controls

The universal profile binds a WASD joystick, Space, Enter and the left mouse button. It is enabled by default when an application is launched, shown with an on-screen HUD, and released when the game process exits. `apkstart --game <app>` guarantees mapping is enabled; `apkstart --controls edit` opens the layout editor as a desktop application; `apkstart --controls off` releases capture. Layouts are edited with F2 inside a game or through the desktop editor.

## Setup and verification

```
npm install -g .
apkstart init --backend waydroid
apkstart init --check
apkstart --install ~/Downloads/app.apk
```

`apkstart init --check` reports installed tools, backend setup modules and the effective sudo grants. The full command reference is in [CLI.md](CLI.md).

<!-- apkstart-linux-origin -->
> Project origin: this is the Linux-focused build of ApkStart, originally created by RoutineMiku. The Linux runtime, command line and backends are developed in this repository.
