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

The backend passes the cached APK path to ATL and translates the launch activity into ATL's slash-separated form. Application data is maintained by ATL under its own data directory.

## Limitations

- Most Android framework classes are not implemented; unimplemented APIs cause failures and need per-app stubs upstream.
- Google Play services, DRM, FCM, Binder and full media stacks are out of scope.
- Games with OpenGL, EGL or SurfaceView dependencies frequently fail to render.
- ATL is C++ and Java upstream. Rewriting it in Rust would mean forking a large project and would not reduce runtime memory.

See [SPECIFICATIONS.md](SPECIFICATIONS.md) for measured memory and a backend comparison.

<!-- apkstart-linux-origin -->
> Project origin: this is the Linux-focused build of ApkStart, originally created by RoutineMiku. The ATL backend and portable module packaging are developed here.
