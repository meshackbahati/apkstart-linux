#!/usr/bin/env bash
# Build the Android Translation Layer as an ApkStart backend (experimental).
# Called by: apkstart init --backend atl
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${HOME}/.local/src/apkstart-atl"
ID="$(. /etc/os-release 2>/dev/null && echo "${ID:-unknown}")"
SUDO="sudo"

say() { printf '\n==> %s\n' "$1"; }
run() { printf '+ %s\n' "$*"; "$@"; }
runroot() { printf '+ sudo %s\n' "$*"; $SUDO "$@"; }

say "Distribution: $ID"
case "$ID" in
  arch|manjaro|endeavouros|cachyos)
    runroot pacman -S --needed git meson ninja jdk17-openjdk maven gtk4 libportal \
      webkitgtk-6.0 speech-dispatcher alsa-lib ffmpeg openxr libsecret libdrm \
      libgudev libwebp lz4 libcap sqlite python
    ;;
  *)
    printf 'Automatic ATL setup is implemented for Arch-based systems. On other distributions, follow https://gitlab.com/android_translation_layer/android_translation_layer/-/blob/master/doc/Build.md and install the binary as android-translation-layer.\n' >&2
    exit 1
    ;;
esac

mkdir -p "$SRC"
cd "$SRC" || exit 1

if [ ! -d bionic_translation ]; then
  say "Building bionic_translation"
  run git clone https://gitlab.com/android_translation_layer/bionic_translation.git
  (cd bionic_translation && run meson setup builddir && run meson compile -C builddir && runroot meson install -C builddir)
fi

if [ ! -d art_standalone ]; then
  say "Building art_standalone"
  run git clone https://gitlab.com/android_translation_layer/art_standalone.git
  (cd art_standalone && run make ____LIBDIR=lib && runroot make ____LIBDIR=lib install)
fi

if [ ! -d android_translation_layer ]; then
  say "Building ATL"
  run git clone https://gitlab.com/android_translation_layer/android_translation_layer.git
  (cd android_translation_layer && run meson setup builddir -Ddownload_tool_deps=true && run meson compile -C builddir && runroot meson install -C builddir)
fi

say "Verifying"
if command -v android-translation-layer >/dev/null 2>&1; then
  android-translation-layer --help >/dev/null 2>&1 || true
  node "$ROOT/bin/apkstart.js" --backend atl
  printf 'ATL is installed and selected.\n'
else
  printf 'ATL binary not found on PATH after install.\n' >&2
  exit 1
fi
