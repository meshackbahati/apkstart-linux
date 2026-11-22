#!/usr/bin/env bash
# Build a portable, ApkStart-owned ATL module (no system-wide install).
# Called by: apkstart init --backend atl
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${HOME}/.local/src/apkstart-atl"
ATL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/apkstart/runtime/atl"
ID="$(. /etc/os-release 2>/dev/null && echo "${ID:-unknown}")"

say() { printf '\n==> %s\n' "$1"; }
run() { printf '+ %s\n' "$*"; "$@"; }

say "Distribution: $ID; portable prefix: $ATL_ROOT"
case "$ID" in
  arch|manjaro|endeavouros|cachyos)
    run sudo pacman -S --needed git meson ninja jdk17-openjdk maven gtk4 libportal \
      webkitgtk-6.0 speech-dispatcher alsa-lib ffmpeg openxr libsecret libdrm \
      libgudev libwebp lz4 libcap sqlite python
    ;;
  *)
    printf 'Automatic ATL setup is implemented for Arch-based systems. On other distributions, follow https://gitlab.com/android_translation_layer/android_translation_layer/-/blob/master/doc/Build.md and install into %s.\n' "$ATL_ROOT" >&2
    exit 1
    ;;
esac

mkdir -p "$SRC" "$ATL_ROOT"
cd "$SRC" || exit 1

if [ ! -d wolfssl ]; then
  say "Fetching wolfSSL with JNI support"
  run git clone --depth 1 --branch v5.8.2-stable https://github.com/wolfSSL/wolfssl.git
fi
say "Installing wolfSSL into the portable prefix"
(cd wolfssl && run autoreconf -i \
  && run ./configure --prefix="$ATL_ROOT" --enable-shared --disable-opensslall \
     --disable-opensslextra --enable-aescbc-length-checks --enable-curve25519 \
     --enable-ed25519 --enable-ed25519-stream --enable-oldtls --enable-base64encode \
     --enable-tlsx --enable-scrypt --disable-examples --enable-crl --enable-jni \
     --enable-sessioncerts CFLAGS="-Wno-error -Wno-error=stringop-truncation" \
  && run make -j"$(nproc)" && run make install) || exit 1

if [ ! -d bionic_translation ]; then
  say "Fetching bionic_translation"
  run git clone https://gitlab.com/android_translation_layer/bionic_translation.git
fi
say "Installing bionic_translation into the portable prefix"
(cd bionic_translation && run meson setup builddir --prefix="$ATL_ROOT" \
  && run meson compile -C builddir && run meson install -C builddir) || exit 1

if [ ! -d art_standalone ]; then
  say "Fetching art_standalone"
  run git clone https://gitlab.com/android_translation_layer/art_standalone.git
fi
say "Installing art_standalone into the portable prefix"
(cd art_standalone && run make -j"$(nproc)" ____LIBDIR=lib ____PREFIX="$ATL_ROOT" \
   HOST_C_INCLUDES="-I$ATL_ROOT/include" \
   HOST_LDFLAGS="-L$ATL_ROOT/lib -Wl,-rpath,$ATL_ROOT/lib" \
  && run make ____LIBDIR=lib ____PREFIX="$ATL_ROOT" install) || exit 1

if [ ! -d android_translation_layer ]; then
  say "Fetching ATL"
  run git clone https://gitlab.com/android_translation_layer/android_translation_layer.git
fi
say "Installing ATL into the portable prefix"
(cd android_translation_layer && run meson setup builddir --prefix="$ATL_ROOT" -Ddownload_tool_deps=true \
  && run meson compile -C builddir && run meson install -C builddir) || exit 1

say "Verification"
BIN="$ATL_ROOT/bin/android-translation-layer"
if [ -x "$BIN" ]; then
  LD_LIBRARY_PATH="$ATL_ROOT/lib:$ATL_ROOT/lib64" "$BIN" --help >/dev/null 2>&1 || true
  run node "$ROOT/bin/apkstart.js" --backend atl
  printf 'Portable ATL installed at %s and selected.\n' "$ATL_ROOT"
else
  printf 'ATL binary not found at %s\n' "$BIN" >&2
  exit 1
fi
