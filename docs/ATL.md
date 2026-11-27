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

1. Install Arch build dependencies: GTK 4, libportal, WebKitGTK 6, speech dispatcher, ALSA, FFmpeg, OpenXR, libsecret, libdrm, libgudev, libwebp, LZ4, libcap, SQLite, JDK 17, Maven, Meson and Ninja.
2. Build `bionic_translation` and install it into the prefix.
3. Build `art_standalone` with `____PREFIX` pointing at the prefix. ART compilation is long (tens of minutes) and produces `dex2oat` and the ART libraries.
4. Build ATL with Meson using `-Ddownload_tool_deps=true` and the same prefix.
5. Select the backend with `apkstart --backend atl`.

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

## Build status on this host

`bionic_translation`, wolfSSL with JNI and `art_standalone` build successfully into the portable prefix. The final ATL Java compilation currently fails on generated `com/android/internal/R.java`, where `javac` reports an unclosed comment. This is an upstream generated-source issue rather than a packaging failure; the script installs the dependencies and leaves the sources and prefix in place so the build can be resumed once upstream fixes the generator.

The Java toolchain is pinned to JDK 17. JDK 27 rejects the Java 8 target and cannot run the upcall generator; JDK 11 cannot compile the generator; JDK 21 fails while resolving its vendored dependencies. JDK 17 is the only version that reaches the generated-source failure.

## Limitations

- Most Android framework classes are not implemented; unimplemented APIs cause failures and need per-app stubs upstream.
- Google Play services, DRM, FCM, Binder and full media stacks are out of scope.
- Games with OpenGL, EGL or SurfaceView dependencies frequently fail to render.
- ATL is C++ and Java upstream. Rewriting it in Rust would mean forking a large project and would not reduce runtime memory.

See [SPECIFICATIONS.md](SPECIFICATIONS.md) for measured memory and a backend comparison.

<!-- apkstart-linux-origin -->
> Project origin: this is the Linux-focused build of ApkStart, originally created by RoutineMiku. The ATL backend and portable module packaging are developed here.
