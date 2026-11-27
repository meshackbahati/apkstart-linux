#!/usr/bin/env bash
# Build a portable, ApkStart-owned Android Translation Layer (ATL) runtime.
# Nothing is installed system-wide except build dependencies from the
# distribution's package manager. Safe to rerun: finished components are
# skipped, so an interrupted build resumes where it stopped.
#
# Called by: apkstart init --backend atl   (run as your normal user)
#
# Supported: Arch and derivatives, Debian/Ubuntu and derivatives, Fedora,
# openSUSE, and Alpine (which ships ATL as a package, so nothing is built).
#
# Optional environment:
#   APKSTART_ATL_REPO / APKSTART_ATL_COMMIT   build another ATL fork or commit
#   APKSTART_ATL_ART_COMMIT                   pin art_standalone
#   APKSTART_ATL_BIONIC_COMMIT                pin bionic_translation
#   APKSTART_ATL_SKIP_DEPS=1                  do not touch system packages
#   APKSTART_ATL_OPENSLES=0                   skip the optional OpenSL ES audio library
#   APKSTART_ATL_JOBS=N                       parallel build jobs (default: CPU count)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${APKSTART_ATL_SRC:-$HOME/.local/src/apkstart-atl}"
ATL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/apkstart/runtime/atl"
STAMPS="$ATL_ROOT/.apkstart"
JOBS="${APKSTART_ATL_JOBS:-$(nproc 2>/dev/null || echo 4)}"

say()  { printf '\n==> %s\n' "$1"; }
note() { printf '    %s\n' "$*"; }
run()  { printf '+ %s\n' "$*"; "$@"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

[ "$(id -u)" -eq 0 ] && die "Run this as your normal user; it asks for sudo only to install packages."

# ---------------------------------------------------------------- distribution
# shellcheck disable=SC1091
OS_ID="$(. /etc/os-release 2>/dev/null && echo "${ID:-unknown}")"
# shellcheck disable=SC1091
OS_LIKE="$(. /etc/os-release 2>/dev/null && echo "${ID_LIKE:-}")"
family() {
  for id in $OS_ID $OS_LIKE; do
    case "$id" in
      arch|manjaro|endeavouros|cachyos|garuda|artix) echo arch; return ;;
      debian|ubuntu|linuxmint|pop|zorin|elementary|neon|kali|raspbian) echo debian; return ;;
      fedora|nobara|ultramarine|rhel|centos) echo fedora; return ;;
      opensuse*|suse|sles) echo suse; return ;;
      alpine|postmarketos) echo alpine; return ;;
    esac
  done
  echo unknown
}
FAMILY="$(family)"
say "Distribution: $OS_ID (family: $FAMILY); portable prefix: $ATL_ROOT"

select_backend() {
  if have apkstart; then run apkstart --backend atl
  else run node "$ROOT/bin/apkstart.js" --backend atl
  fi
}

# ---------------------------------------------------------------- dependencies
install_deps() {
  case "$FAMILY" in
    arch)
      run sudo pacman -S --needed --noconfirm git meson ninja base-devel autoconf automake libtool \
        jdk17-openjdk maven ant python gtk4 libportal libportal-gtk4 webkitgtk-6.0 speech-dispatcher \
        alsa-lib ffmpeg openxr libsecret libdrm libgudev libwebp lz4 libcap libbsd glib2-devel \
        wayland-protocols sqlite bison flex vulkan-headers vulkan-icd-loader libsndfile ;;
    debian)
      run sudo apt-get update
      run sudo apt-get install -y git meson ninja-build build-essential autoconf automake libtool \
        openjdk-17-jdk-headless maven pkg-config python3 bison flex \
        libasound2-dev libavcodec-dev libavformat-dev libswscale-dev libcap-dev libdrm-dev \
        libglib2.0-dev libgtk-4-dev libgudev-1.0-dev libopenxr-dev libportal-dev libportal-gtk4-dev \
        libsqlite3-dev libwebkitgtk-6.0-dev libsecret-1-dev libspeechd-dev libwebp-dev liblz4-dev \
        libbsd-dev wayland-protocols libvulkan-dev libsndfile1-dev libasm-java libgetopt-java ;;
    fedora)
      run sudo dnf install -y git meson ninja-build gcc gcc-c++ make autoconf automake libtool \
        java-17-openjdk-devel maven python3 bison flex objectweb-asm \
        'pkgconfig(gtk4)' 'pkgconfig(libbsd)' 'pkgconfig(libportal)' 'pkgconfig(libportal-gtk4)' \
        'pkgconfig(sqlite3)' 'pkgconfig(libwebp)' 'pkgconfig(liblz4)' 'pkgconfig(openxr)' \
        'pkgconfig(webkitgtk-6.0)' 'pkgconfig(libsecret-1)' 'pkgconfig(speech-dispatcher)' \
        'pkgconfig(alsa)' 'pkgconfig(libavcodec)' 'pkgconfig(libdrm)' 'pkgconfig(gudev-1.0)' \
        'pkgconfig(libcap)' wayland-protocols-devel vulkan-headers vulkan-loader-devel 'pkgconfig(sndfile)' ;;
    suse)
      run sudo zypper --non-interactive install git meson ninja gcc gcc-c++ make autoconf automake libtool \
        java-17-openjdk-devel maven python3 bison flex objectweb-asm java-getopt \
        'pkgconfig(gtk4)' 'pkgconfig(libbsd)' 'pkgconfig(libportal)' 'pkgconfig(libportal-gtk4)' \
        'pkgconfig(sqlite3)' 'pkgconfig(libwebp)' 'pkgconfig(liblz4)' 'pkgconfig(openxr)' \
        'pkgconfig(webkitgtk-6.0)' 'pkgconfig(libsecret-1)' 'pkgconfig(speech-dispatcher)' \
        'pkgconfig(alsa)' 'pkgconfig(libavcodec)' 'pkgconfig(libdrm)' 'pkgconfig(gudev-1.0)' \
        'pkgconfig(libcap)' wayland-protocols-devel vulkan-devel 'pkgconfig(sndfile)' ;;
    *)
      die "Automatic ATL setup supports Arch, Debian/Ubuntu, Fedora, openSUSE and Alpine. Elsewhere follow https://gitlab.com/android_translation_layer/android_translation_layer/-/blob/master/doc/Build.md with --prefix=$ATL_ROOT, then run: apkstart --backend atl" ;;
  esac
}

if [ "$FAMILY" = alpine ]; then
  # Alpine edge packages ATL and all of its parts; use that instead of building.
  say "Installing the packaged ATL from Alpine's testing repository"
  grep -q 'edge/testing' /etc/apk/repositories 2>/dev/null \
    || note "Add https://dl-cdn.alpinelinux.org/alpine/edge/testing to /etc/apk/repositories if the install fails."
  run sudo apk add android-translation-layer || die "apk could not install android-translation-layer."
  select_backend
  exit 0
fi

if [ "${APKSTART_ATL_SKIP_DEPS:-}" = 1 ]; then
  say "Skipping system packages (APKSTART_ATL_SKIP_DEPS=1)"
else
  say "Installing build dependencies"
  install_deps || die "Installing build dependencies failed."
fi

# ATL's code generators need exactly JDK 17 (newer JDKs reject the Java 8
# target or fail on vendored dependencies; JDK 11 cannot compile the generator).
JDK=""
for j in "${JAVA_HOME:-}" /usr/lib/jvm/java-17-openjdk /usr/lib/jvm/java-17-openjdk-amd64 \
         /usr/lib/jvm/java-17-openjdk-arm64 /usr/lib/jvm/java-17 /usr/lib64/jvm/java-17-openjdk; do
  if [ -n "$j" ] && [ -x "$j/bin/javac" ] && "$j/bin/javac" -version 2>&1 | grep -q ' 17\.'; then JDK="$j"; break; fi
done
[ -n "$JDK" ] || die "JDK 17 not found. Install it (Arch: jdk17-openjdk, Debian: openjdk-17-jdk-headless, Fedora/openSUSE: java-17-openjdk-devel)."
note "Using JDK 17 at $JDK"

# Homebrew/Linuxbrew on PATH shadows the system pkg-config, which then cannot
# see distribution libraries (gtk4, sndfile, ...) and the build fails or links
# against the wrong copies. Build only against the distribution toolchain.
CLEAN=""
IFS=: read -r -a _path_parts <<< "$PATH"
for d in "${_path_parts[@]}"; do
  case "$d" in */linuxbrew/*|*/.linuxbrew/*|/opt/homebrew/*) continue ;; esac
  CLEAN="${CLEAN:+$CLEAN:}$d"
done
export PATH="$CLEAN"
if [ -x /usr/bin/pkg-config ]; then export PKG_CONFIG=/usr/bin/pkg-config
elif [ -x /usr/bin/pkgconf ]; then export PKG_CONFIG=/usr/bin/pkgconf
fi

mkdir -p "$SRC" "$ATL_ROOT" "$STAMPS"
cd "$SRC" || die "Cannot enter $SRC"

# fetch <dir> <url> [ref]: clone once, then check out the pinned ref if given.
fetch() {
  local dir="$1" url="$2" ref="${3:-}"
  if [ ! -d "$dir/.git" ]; then
    rm -rf "$dir"
    say "Fetching $dir"
    local tries=0
    until run git clone "$url" "$dir"; do
      tries=$((tries + 1)); [ "$tries" -ge 3 ] && die "Could not clone $url"
      rm -rf "$dir"; sleep 3
    done
  fi
  if [ -n "$ref" ]; then
    run git -C "$dir" fetch --quiet origin "$ref" 2>/dev/null || true
    run git -C "$dir" checkout --quiet "$ref" || die "Cannot check out $ref in $dir"
  fi
}
rev() { git -C "$1" rev-parse --short=12 HEAD 2>/dev/null || echo unknown; }
done_for() { [ -f "$STAMPS/$1" ] && [ "$(cat "$STAMPS/$1")" = "$2" ]; }
mark() { printf '%s\n' "$2" > "$STAMPS/$1"; }

export PKG_CONFIG_PATH="$ATL_ROOT/lib/pkgconfig:$ATL_ROOT/lib64/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
export LD_LIBRARY_PATH="$ATL_ROOT/lib:$ATL_ROOT/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LIBRARY_PATH="$ATL_ROOT/lib:$ATL_ROOT/lib64${LIBRARY_PATH:+:$LIBRARY_PATH}"

meson_build() { # meson_build <dir> [extra setup args...]
  local dir="$1"; shift
  (
    cd "$dir" || exit 1
    if [ -d builddir ]; then run meson configure builddir --prefix="$ATL_ROOT"
    else run meson setup builddir --prefix="$ATL_ROOT" --libdir=lib "$@"
    fi
    run meson compile -C builddir -j "$JOBS" && run meson install -C builddir
  )
}

# ---------------------------------------------------------------- wolfSSL (JNI)
fetch wolfssl https://github.com/wolfSSL/wolfssl.git v5.8.2-stable
if done_for wolfssl "$(rev wolfssl)" && [ -e "$ATL_ROOT/lib/libwolfssl.so" ]; then
  note "wolfSSL already built ($(rev wolfssl))."
else
  say "Building wolfSSL with JNI support"
  (cd wolfssl && run autoreconf -i \
    && run ./configure --prefix="$ATL_ROOT" --enable-shared --disable-opensslall \
       --disable-opensslextra --enable-aescbc-length-checks --enable-curve25519 \
       --enable-ed25519 --enable-ed25519-stream --enable-oldtls --enable-base64encode \
       --enable-tlsx --enable-scrypt --disable-examples --enable-crl --enable-jni \
       --enable-sessioncerts CFLAGS="-Wno-error -Wno-error=stringop-truncation" \
    && run make -j"$JOBS" && run make install) || die "wolfSSL build failed."
  mark wolfssl "$(rev wolfssl)"
fi

# ---------------------------------------------------------------- bionic_translation
fetch bionic_translation https://gitlab.com/android_translation_layer/bionic_translation.git "${APKSTART_ATL_BIONIC_COMMIT:-}"
if done_for bionic "$(rev bionic_translation)"; then
  note "bionic_translation already built ($(rev bionic_translation))."
else
  say "Building bionic_translation"
  meson_build bionic_translation || die "bionic_translation build failed."
  mark bionic "$(rev bionic_translation)"
fi

# ---------------------------------------------------------------- art_standalone
fetch art_standalone https://gitlab.com/android_translation_layer/art_standalone.git "${APKSTART_ATL_ART_COMMIT:-}"
if done_for art "$(rev art_standalone)" && [ -e "$ATL_ROOT/lib/pkgconfig/art-standalone.pc" ]; then
  note "art_standalone already built ($(rev art_standalone))."
else
  say "Building art_standalone (the longest step: 30-90 minutes)"
  # wolfSSL JNI hard-codes external/wolfssl as an include path; point it at the
  # portable prefix rather than patching the vendored Android makefile.
  mkdir -p art_standalone/external/wolfssl art_standalone/out/host/linux-x86/lib64
  ln -sfn "$ATL_ROOT/include/wolfssl" art_standalone/external/wolfssl/wolfssl
  ln -sfn "$ATL_ROOT/lib/libwolfssl.so" art_standalone/out/host/linux-x86/lib64/libwolfssl.so
  (cd art_standalone \
    && run make -j"$JOBS" ____LIBDIR=lib ____PREFIX="$ATL_ROOT" \
    && run make ____LIBDIR=lib ____PREFIX="$ATL_ROOT" install) || die "art_standalone build failed."
  # The generated pkg-config file hard-codes the build-time prefix.
  sed -i "s|^prefix=.*|prefix=$ATL_ROOT|" "$ATL_ROOT/lib/pkgconfig/art-standalone.pc"
  mark art "$(rev art_standalone)"
fi

# ---------------------------------------------------------------- libOpenSLES (optional)
if [ "${APKSTART_ATL_OPENSLES:-1}" != 0 ]; then
  fetch libopensles-standalone https://gitlab.com/android_translation_layer/libopensles-standalone.git
  if done_for opensles "$(rev libopensles-standalone)"; then
    note "libOpenSLES already built."
  else
    say "Building libOpenSLES (audio for apps that use OpenSL ES; optional)"
    if meson_build libopensles-standalone; then mark opensles "$(rev libopensles-standalone)"
    else note "libOpenSLES did not build; continuing without it (only some apps need it)."
    fi
  fi
fi

# ---------------------------------------------------------------- ATL
ATL_REPO="${APKSTART_ATL_REPO:-https://gitlab.com/android_translation_layer/android_translation_layer.git}"
fetch android_translation_layer "$ATL_REPO" "${APKSTART_ATL_COMMIT:-}"
if done_for atl "$(rev android_translation_layer)" && [ -x "$ATL_ROOT/bin/android-translation-layer" ]; then
  note "ATL already built ($(rev android_translation_layer))."
else
  say "Building ATL"
  (
    cd android_translation_layer || exit 1
    export JAVA_HOME="$JDK"
    # Only the JDK and the prefix's helper tools go first on PATH. A foreign
    # `aapt` (Android SDK, distro android-tools) must not be found: when it is,
    # ATL regenerates the committed com/android/internal/R.java with that aapt,
    # and newer aapt versions emit comments javac rejects ("unclosed comment").
    CLEAN_PATH=""
    IFS=: read -r -a parts <<< "$PATH"
    for d in "${parts[@]}"; do
      [ -x "$d/aapt" ] && continue
      CLEAN_PATH="${CLEAN_PATH:+$CLEAN_PATH:}$d"
    done
    if [ -x "$ATL_ROOT/bin/aapt" ]; then note "Ignoring $ATL_ROOT/bin/aapt for the framework resources."; fi
    export PATH="$JDK/bin:$CLEAN_PATH"
    [ -d "$ATL_ROOT/bin" ] && [ ! -x "$ATL_ROOT/bin/aapt" ] && export PATH="$PATH:$ATL_ROOT/bin"
    # Undo any earlier regeneration so the committed resources are used.
    git checkout -- src/api-impl/com/android/internal/R.java 2>/dev/null || true

    extra=()
    case "$FAMILY" in
      debian) extra=(-Dasm_jar_path=/usr/share/java/asm.jar -Dasm_tree_jar_path=/usr/share/java/asm-tree.jar
                     -Dgetopt_jar_path=/usr/share/java/gnu-getopt.jar) ;;
      suse)   extra=(-Dgetopt_jar_path=/usr/share/java/gnu.getopt.jar) ;;
      *)      extra=(-Ddownload_tool_deps=true) ;;
    esac
    if [ -d builddir ]; then run meson configure builddir --prefix="$ATL_ROOT"
    else run meson setup builddir --prefix="$ATL_ROOT" --libdir=lib "${extra[@]}"
    fi
    run meson compile -C builddir -j "$JOBS" && run meson install -C builddir
  ) || die "ATL build failed. Fix the error above and rerun; finished components are kept."
  mark atl "$(rev android_translation_layer)"
fi

# ---------------------------------------------------------------- verify + select
say "Verification"
BIN="$ATL_ROOT/bin/android-translation-layer"
[ -x "$BIN" ] || die "ATL binary not found at $BIN"
if ! LD_LIBRARY_PATH="$ATL_ROOT/lib:$ATL_ROOT/lib64" "$BIN" --help >/dev/null 2>&1; then
  LD_LIBRARY_PATH="$ATL_ROOT/lib:$ATL_ROOT/lib64" "$BIN" --help 2>&1 | tail -5
  die "ATL is installed but does not start; see the output above."
fi
note "ATL $(rev "$SRC/android_translation_layer") runs."
select_backend
printf '\nPortable ATL installed at %s and selected.\n' "$ATL_ROOT"
printf 'Check an APK first with: apkstart atl-check <file.apk>\n'
