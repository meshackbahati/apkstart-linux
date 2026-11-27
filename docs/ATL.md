# Android Translation Layer module

The ATL backend runs a compatible APK as an ordinary Linux process with its own window. There is no container, no Android boot and no fixed guest memory allocation. Compatibility is decided app by app upstream, so this backend is experimental.

## Portable layout

`apkstart init --backend atl` builds and installs the module into:

```
$XDG_DATA_HOME/apkstart/runtime/atl
├── bin/android-translation-layer
├── lib/                     # native libraries
└── share/bionic_translation/ # bionic configuration
```

The backend sets `LD_LIBRARY_PATH` and `BIONIC_TRANSLATION_CONFIG` when launching an APK. Nothing is installed system-wide; deleting the prefix removes the module. Build sources are cached separately under `~/.local/src/apkstart-atl`.

## Build sequence

Run it as your normal user; it asks for sudo only to install packages:

```
apkstart init --backend atl        # or: bash scripts/setup-atl.sh
```

| Distribution | What the script does |
|---|---|
| Arch and derivatives | Installs build dependencies with pacman, then builds everything into the prefix |
| Debian, Ubuntu and derivatives | Installs dependencies with apt, uses the distro's `asm` and `getopt` jars |
| Fedora | Installs dependencies with dnf (`pkgconfig(...)` names), downloads the generator jars with Maven |
| openSUSE | Installs dependencies with zypper, points Meson at the `gnu.getopt` jar |
| Alpine (edge/testing) | Installs the packaged `android-translation-layer`; nothing is built |

Steps:

1. Install build dependencies (skip with `APKSTART_ATL_SKIP_DEPS=1`) and find JDK 17.
2. Build wolfSSL with JNI support.
3. Build `bionic_translation`.
4. Build `art_standalone` with `____PREFIX` pointing at the prefix. This is the longest step (30–90 minutes) and produces `dex2oat` and the ART libraries.
5. Build the optional `libopensles-standalone` audio library (skip with `APKSTART_ATL_OPENSLES=0`). Failure here does not stop the build.
6. Build ATL with Meson into the same prefix.
7. Run `android-translation-layer --help` as a smoke test and select the backend.

Each finished component is recorded in `$PREFIX/.apkstart/<component>` with its source commit. A rerun skips components whose commit has not changed, so an interrupted or failed build resumes from the failing step. `APKSTART_ATL_JOBS` sets the parallel job count.

## Launching

```
apkstart --backend atl
apkstart --install /path/to/app.apk
apkstart app-name
```

The backend builds the launch command from ATL's own conventions. The cached
APK is exposed through a stable `<package>.apk` symlink in
`$XDG_DATA_HOME/apkstart/atl/launch`, because ATL derives its data directory
from the APK file name and ApkStart's cache uses a versioned name. The child
receives `ANDROID_APP_DATA_DIR`, a window size (`-w` / `-h`, default 1200×850),
an SDK level derived from `minSdk` and `targetSdk` (`--sdk-int`, 21–36), a
stable `--gapplication-app-id`, and the system Java trust store when present.
Split APK parts are passed after the base package.

Per-app overrides live in `settings.atl[<package>]` and may contain `size`
(`WxH`, 200–10000 per axis), `sdk` (21–36), `titlebar`, `mouseAsTouch` and
`deniedPermissions`. The last three require the maintained ATL fork; vanilla
ATL ignores those environment variables. They are harmless on vanilla builds.

### Compatibility check

ATL runs the APK's native libraries directly and has no Google Play services, so some apps cannot work however ATL is built. Before installing on the ATL backend, ApkStart reads the APK offline and reports one of:

| Verdict | Meaning | Install |
|---|---|---|
| `likely` | Nothing known to be missing | Proceeds |
| `risky` | Uses Play services, Firebase push, Play licensing or Integrity, or a game engine (Unity, Unreal, Godot, Cocos2d, Flutter) | Proceeds with a warning |
| `blocked` | Native code exists only for other CPU types (for example ARM-only on x86_64); ATL cannot translate instructions | Refused unless `--force` |

Check APKs without installing them:

```
apkstart atl-check app.apk [more.apk ...] [--json]
```

The verdict is saved on the app record (`atlCompat`). References to `MediaDrm` are reported as a note only, because media libraries include them even in apps that never play protected video.

### Logs, crashes and process tracking

- Each app's ATL output goes to `$XDG_DATA_HOME/apkstart/atl/logs/<package>.log`, with a header line per launch.
- When ATL exits within the first few seconds, the launch is reported as failed, with the exit status and the last lines of the log, instead of appearing to do nothing.
- Running apps are tracked in `$XDG_DATA_HOME/apkstart/atl/run/<package>.pid`, so `apkstart --stop <app>`, the GUI and `--stop-runtime` can stop apps started by another ApkStart process. Stopping signals the whole process group. PIDs are checked against `/proc/<pid>/cmdline` so a reused PID is never signalled.
- Uninstalling removes the app's data directory, launch link and log.

### Signer pinning

Install records store the APK v2 signer certificate hash. A later install of
the same package with a different signer is refused before any install command
runs, which extends Android's update-signature rule to the ATL backend. Use
`apkstart verify <file.apk> [--cert SHA256]` to check a package manually.

### Source selection

`scripts/setup-atl.sh` fetches vanilla ATL by default. Set
`APKSTART_ATL_REPO` and optionally `APKSTART_ATL_COMMIT` to build a pinned
fork, for example the maintained `Jimbambuli/android_translation_layer` fork
which implements per-app title bars, mouse-as-touch and permission gating.
ATL is GPL software built from source; its licence applies to the built
runtime, while ApkStart's own code remains MIT.

## Build status

Built end to end on Arch Linux (kernel 7.2, GCC from the distribution, JDK 17) on 28 November 2026 with `bionic_translation` 6253dec, `art_standalone` 381138f, ATL b87f045 and wolfSSL 5.8.2:

- `art_standalone` took about 75 minutes on 8 cores; the rest about 20 minutes.
- `android-translation-layer --help` runs, and `ldd` shows only distribution libraries plus the prefix.
- F-Droid 2.0.3 (`org.fdroid.fdroid`, x86_64 and ARM libraries) installs through `apkstart --install`, opens its window, and downloads and saves the F-Droid repository index over HTTPS (1,250+ apps) as an ordinary process using about 260 MB.
- `apkstart --stop org.fdroid.fdroid` from a separate process stops it and removes its PID file; relaunching works.

Build problems found on the way, all handled by the script:

- **Vulkan headers and libsndfile** are needed (by `libandroid` and `libOpenSLES`) but missing from upstream's dependency list.
- **Homebrew/Linuxbrew on PATH** shadows the system `pkg-config`, which then cannot see distribution libraries. The script drops those directories from `PATH` for the build and uses the system `pkg-config`.
- **`R.java` "unclosed comment"** (reported on the original build host). `res/framework-res/meson.build` regenerates the committed `src/api-impl/com/android/internal/R.java` whenever an `aapt` binary is on `PATH`, and copies the prebuilt `framework-res.apk` otherwise. On the host above, with no `aapt` anywhere, the committed `R.java` compiled without error. The script removes directories that contain `aapt` from `PATH` for the ATL step and restores the committed `R.java`, so the build takes the path that is known to work. Whether a particular `aapt` version produces the bad comment has not been reproduced here.

The Java toolchain is pinned to JDK 17. JDK 27 rejects the Java 8 target and cannot run the upcall generator; JDK 11 cannot compile the generator; JDK 21 fails while resolving its vendored dependencies. JDK 17 is the only version that reaches the generated-source failure.

## Limitations

- Most Android framework classes are not implemented; unimplemented APIs cause failures and need per-app stubs upstream.
- Google Play services, DRM, FCM, Binder and full media stacks are out of scope.
- Games with OpenGL, EGL or SurfaceView dependencies frequently fail to render.
- ATL is C++ and Java upstream. Rewriting it in Rust would mean forking a large project and would not reduce runtime memory.

See [SPECIFICATIONS.md](SPECIFICATIONS.md) for measured memory and a backend comparison.

<!-- apkstart-linux-origin -->
> Project origin: this is the Linux-focused build of ApkStart, originally created by RoutineMiku. The ATL backend and portable module packaging are developed here.
