#!/usr/bin/env bash
# Canonical ApkStart setup for the Waydroid backend on Linux (the recommended backend).
# Idempotent: safe to run again after an update or a container reset.
# Called by: apkstart init --backend waydroid   (or run directly; it asks for sudo when needed)
#
# Supported out of the box: Arch and derivatives (Manjaro, EndeavourOS, CachyOS, Garuda),
# Debian, Ubuntu and derivatives (Mint, Pop!_OS, Zorin, elementary, KDE neon),
# Fedora and derivatives (Nobara, Ultramarine), openSUSE (Tumbleweed, Leap) and Void.
# Anywhere else: install Waydroid with your package manager, then rerun this script.
#
# Optional environment:
#   WAYDROID_GAPPS=1         initialise the image with Google Play services
#   APKSTART_SKIP_CONTROLS=1 skip the keyboard-to-touch game controls (key2touch)
#   APKSTART_ASSUME_YES=1    do not stop on the Wayland check
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ---------------------------------------------------------------- identity
# Works whether started as a normal user (sudo for root steps) or under sudo
# (drop back to the real user for the session, adb and ApkStart settings).
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
  USER_NAME="${SUDO_USER:-root}"
else
  SUDO="sudo"
  USER_NAME="$(id -un)"
fi
USER_HOME="$(getent passwd "$USER_NAME" 2>/dev/null | cut -d: -f6)"
USER_HOME="${USER_HOME:-$HOME}"
USER_UID="$(id -u "$USER_NAME" 2>/dev/null || id -u)"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/apkstart-setup.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

say()     { printf '\n==> %s\n' "$1"; }
note()    { printf '    %s\n' "$*"; }
die()     { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
have()    { command -v "$1" >/dev/null 2>&1; }
runroot() { printf '+ sudo %s\n' "$*"; ${SUDO:+$SUDO} "$@"; }
# Run as the desktop user, with the session variables Waydroid needs.
asuser() {
  if [ "$(id -u)" -eq 0 ] && [ "$USER_NAME" != "root" ]; then
    sudo -u "$USER_NAME" env \
      XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$USER_UID}" \
      WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}" \
      DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/$USER_UID/bus}" \
      HOME="$USER_HOME" PATH="$PATH" "$@"
  else
    "$@"
  fi
}

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
      void) echo void; return ;;
      nixos) echo nixos; return ;;
    esac
  done
  echo unknown
}
FAMILY="$(family)"
say "Distribution: $OS_ID (family: $FAMILY); user: $USER_NAME"

# ---------------------------------------------------------------- preflight
say "Checking the desktop session"
SESSION="${XDG_SESSION_TYPE:-}"
if [ -n "${WAYLAND_DISPLAY:-}" ] || [ "$SESSION" = "wayland" ]; then
  note "Wayland session detected."
else
  note "Waydroid draws app windows through Wayland, and this session is '${SESSION:-unknown}'."
  note "Log out and pick the Wayland session (GNOME, KDE Plasma, Hyprland, Sway...) at the login screen."
  if [ "${APKSTART_ASSUME_YES:-}" != "1" ]; then
    die "No Wayland session. Rerun from a Wayland session, or set APKSTART_ASSUME_YES=1 to install anyway."
  fi
fi

say "Checking kernel support (binder)"
binder_ok=0
if [ -e /dev/binderfs ] || [ -e /dev/binder ] || grep -qw binder /proc/filesystems 2>/dev/null; then
  binder_ok=1
elif [ -r /proc/config.gz ] && zgrep -qE '^CONFIG_ANDROID_BINDER_IPC(_RUST)?=y' /proc/config.gz 2>/dev/null; then
  binder_ok=1
elif modinfo binder_linux >/dev/null 2>&1; then
  runroot modprobe binder_linux devices=binder,hwbinder,vndbinder 2>/dev/null && binder_ok=1
fi
if [ "$binder_ok" = 1 ]; then
  note "Binder is available."
else
  note "Binder was not found in this kernel. Waydroid cannot start without it."
  case "$FAMILY" in
    arch)   note "Fix: install linux-zen, or the binder_linux-dkms package from the AUR, then reboot." ;;
    debian) note "Fix: sudo apt install linux-modules-extra-\$(uname -r), or use a kernel with binder enabled." ;;
    *)      note "Fix: use a kernel with CONFIG_ANDROID_BINDER_IPC=y (most current distribution kernels have it)." ;;
  esac
  die "Binder is missing."
fi

# ---------------------------------------------------------------- install
say "Installing Waydroid"
if have waydroid; then
  note "Waydroid is already installed: $(waydroid --version 2>/dev/null || echo present)."
else
  case "$FAMILY" in
    arch)
      runroot pacman -S --needed --noconfirm waydroid ;;
    debian)
      # Official Waydroid repository (https://docs.waydro.id/usage/install-on-desktops).
      runroot apt-get update
      runroot apt-get install -y curl ca-certificates
      curl -fsSL https://repo.waydro.id -o "$TMP_DIR/waydroid-repo.sh" || die "Could not reach repo.waydro.id."
      runroot bash "$TMP_DIR/waydroid-repo.sh"
      runroot apt-get install -y waydroid ;;
    fedora)
      runroot dnf install -y waydroid ;;
    suse)
      runroot zypper --non-interactive install waydroid ;;
    void)
      runroot xbps-install -Sy waydroid ;;
    nixos)
      die "On NixOS add 'virtualisation.waydroid.enable = true;' to configuration.nix, run nixos-rebuild switch, then rerun this script." ;;
    *)
      die "Unknown distribution '$OS_ID'. Install Waydroid with your package manager (see https://docs.waydro.id), then rerun this script." ;;
  esac
  have waydroid || die "Waydroid did not install."
fi

# ---------------------------------------------------------------- container
say "Enabling the Waydroid container"
if have systemctl && [ -d /run/systemd/system ]; then
  runroot systemctl enable --now waydroid-container
elif have rc-service; then
  runroot rc-update add waydroid-container default 2>/dev/null || true
  runroot rc-service waydroid-container start
elif have sv; then
  runroot ln -sf /etc/sv/waydroid-container /var/service/ 2>/dev/null || true
  runroot sv up waydroid-container 2>/dev/null || true
else
  note "No supported service manager found; starting the container directly."
  runroot waydroid container start >/dev/null 2>&1 &
fi

if [ ! -f /var/lib/waydroid/images/system.img ] && [ ! -f /usr/share/waydroid-extra/images/system.img ]; then
  say "Downloading and initialising the Android image (about 1 GB, one time)"
  if [ "${WAYDROID_GAPPS:-}" = "1" ]; then
    runroot waydroid init -s GAPPS
  else
    runroot waydroid init
  fi
else
  note "Android image already initialised."
fi

# ---------------------------------------------------------------- session
session_running() { asuser waydroid status 2>/dev/null | grep -q 'Session:.*RUNNING'; }
start_session() {
  asuser nohup waydroid session start >"$TMP_DIR/waydroid-session.log" 2>&1 &
  for _ in $(seq 1 45); do
    session_running && return 0
    sleep 1
  done
  return 1
}

say "Starting a Waydroid session as $USER_NAME"
if ! session_running; then
  start_session || { cat "$TMP_DIR/waydroid-session.log" >&2; die "The Waydroid session did not start (log above)."; }
fi

say "Configuring the guest for desktop windows"
# Each Android app becomes its own native window instead of one full-phone window.
current="$(asuser waydroid prop get persist.waydroid.multi_windows 2>/dev/null | tail -1)"
asuser waydroid prop set persist.waydroid.multi_windows true 2>/dev/null || true
asuser waydroid prop set show_ime_with_hard_keyboard 0 2>/dev/null || true
if [ "$current" != "true" ]; then
  note "Restarting the session so multi-window mode takes effect."
  asuser waydroid session stop >/dev/null 2>&1 || true
  sleep 2
  start_session || die "The Waydroid session did not restart."
fi

# ---------------------------------------------------------------- game controls
say "Keyboard-to-touch game controls"
if [ "${APKSTART_SKIP_CONTROLS:-}" = "1" ]; then
  note "Skipped (APKSTART_SKIP_CONTROLS=1)."
elif ! have key2touch && [ "$FAMILY" != "arch" ]; then
  note "key2touch is only packaged in the AUR. Game controls stay off; everything else works."
else
  if ! have key2touch; then
    if have yay; then asuser yay -S --needed --noconfirm key2touch-git
    elif have paru; then asuser paru -S --needed --noconfirm key2touch-git
    else note "No AUR helper (yay or paru) found; skipping key2touch."
    fi
  fi
  if have key2touch; then
    runroot usermod -aG input "$USER_NAME" 2>/dev/null || true
    # Narrow passwordless rules: only these exact commands may run without a
    # prompt, so ApkStart can wake an idle container and manage game controls.
    # Never take sudoers paths from PATH: it can contain user-writable folders
    # (~/.local/bin, linuxbrew), which would turn these rules into passwordless root.
    # Only accept root-owned binaries in system folders that only root can write.
    root_only() {
      local p="$1" d
      [ -x "$p" ] && [ ! -L "$p" ] || return 1
      d="$p"
      while :; do
        [ "$(stat -c %u "$d")" = 0 ] || return 1
        [ -z "$(find "$d" -maxdepth 0 -perm /022)" ] || return 1
        [ "$d" = "/" ] && break
        d="$(dirname "$d")"
      done
    }
    pick_system_bin() {
      local c
      for c in "/usr/bin/$1" "/usr/sbin/$1" "/bin/$1" "/sbin/$1"; do
        root_only "$c" && { printf '%s' "$c"; return 0; }
      done
      return 1
    }
    UNFREEZE="$(pick_system_bin lxc-unfreeze)" || die "lxc-unfreeze is not installed as a root-owned system binary."
    K2T_BIN="$(pick_system_bin key2touch)" || die "key2touch is not installed as a root-owned system binary (expected /usr/bin/key2touch)."
    printf '%s ALL=(root) NOPASSWD: %s -P /var/lib/waydroid/lxc -n waydroid\n' "$USER_NAME" "$UNFREEZE" > "$TMP_DIR/apkstart-unfreeze.rules"
    printf '%s ALL=(:input) SETENV: NOPASSWD: %s\n' "$USER_NAME" "$K2T_BIN" > "$TMP_DIR/apkstart-key2touch.rules"
    for f in unfreeze key2touch; do
      if have visudo && ! visudo -cf "$TMP_DIR/apkstart-$f.rules" >/dev/null 2>&1; then
        die "Generated sudoers rule for $f failed validation; nothing was installed."
      fi
    done
    runroot install -m 440 "$TMP_DIR/apkstart-unfreeze.rules" /etc/sudoers.d/apkstart-waydroid
    runroot install -m 440 "$TMP_DIR/apkstart-key2touch.rules" /etc/sudoers.d/apkstart-key2touch
    K2T() { sudo -n -g input -u "$USER_NAME" key2touch "$@"; }
    if ! K2T profiles 2>/dev/null | grep -q universal; then
      K2T profile new universal >/dev/null 2>&1 || true
      # The output name is the first Wayland output; override with
      # `key2touch set output <name> -p universal` on multi-monitor systems.
      OUT="$(wayland-info 2>/dev/null | grep -m1 'name:' | awk '{print $2}' | tr -d ',')"
      [ -n "$OUT" ] && K2T set output "$OUT" -p universal >/dev/null 2>&1 || true
      K2T point add stick 28% 70% --keys w,a,s,d -p universal >/dev/null 2>&1 || true
      K2T point add look 62% 38% --sens 1.0 --size 0.18 -p universal >/dev/null 2>&1 || true
      K2T point add tap lmb 88% 62% -p universal >/dev/null 2>&1 || true
      K2T point add tap rmb 88% 70% -p universal >/dev/null 2>&1 || true
      K2T point add tap space 85% 80% -p universal >/dev/null 2>&1 || true
      K2T point add tap enter 78% 54% -p universal >/dev/null 2>&1 || true
      K2T point add tap q 70% 62% -p universal >/dev/null 2>&1 || true
      K2T point add tap e 76% 62% -p universal >/dev/null 2>&1 || true
      K2T point add tap r 82% 62% -p universal >/dev/null 2>&1 || true
      K2T point add tap lshift 70% 78% -p universal >/dev/null 2>&1 || true
      K2T point add tap lctrl 76% 86% -p universal >/dev/null 2>&1 || true
      K2T point add tap 1 92% 44% -p universal >/dev/null 2>&1 || true
      K2T point add tap 2 92% 50% -p universal >/dev/null 2>&1 || true
      K2T point add tap 3 92% 56% -p universal >/dev/null 2>&1 || true
    fi
    K2T set only-focused false -p universal >/dev/null 2>&1 || true
    K2T hide >/dev/null 2>&1 || true
    # key2touch ships Chinese messages; keep the installed package English.
    runroot python3 "$ROOT/scripts/translate-key2touch.py" >/dev/null 2>&1 || true
    note "Game controls are off by default. ApkStart enables them only while a game runs; press F2 in a game to edit the layout."
  fi
fi

# ---------------------------------------------------------------- adb
say "Authorising adb with the guest"
ADB_KEY="$USER_HOME/.android/adbkey"
if [ ! -f "$ADB_KEY.pub" ]; then
  ADB_BIN="$(command -v adb || true)"
  [ -z "$ADB_BIN" ] && [ -x "$USER_HOME/.local/share/apkstart/runtime/platform-tools/adb" ] \
    && ADB_BIN="$USER_HOME/.local/share/apkstart/runtime/platform-tools/adb"
  if [ -n "$ADB_BIN" ]; then
    asuser mkdir -p "$USER_HOME/.android"
    asuser "$ADB_BIN" keygen "$ADB_KEY" >/dev/null 2>&1 || true
  fi
fi
if [ -f "$ADB_KEY.pub" ]; then
  ${SUDO:+$SUDO} lxc-unfreeze -P /var/lib/waydroid/lxc -n waydroid 2>/dev/null || true
  KEY="$(base64 -w0 "$ADB_KEY.pub")"
  runroot lxc-attach -P /var/lib/waydroid/lxc -n waydroid -- /system/bin/sh -c \
    "export PATH=/system/bin:/system/xbin; mkdir -p /data/misc/adb; echo '$KEY' | base64 -d > /data/misc/adb/adb_keys; chmod 600 /data/misc/adb/adb_keys; chown shell:shell /data/misc/adb/adb_keys; setprop ctl.start adbd" 2>/dev/null \
    || note "Could not write the adb key into the guest yet; ApkStart retries on first launch."
else
  note "No adb key yet. Start ApkStart once, then rerun: apkstart init --backend waydroid"
fi

# ---------------------------------------------------------------- select
say "Selecting the Waydroid backend"
if have apkstart; then
  asuser apkstart --backend waydroid
else
  asuser node "$ROOT/bin/apkstart.js" --backend waydroid
fi

say "Verification"
asuser waydroid status 2>&1 | head -6
printf '\nSetup complete. Install an APK with: apkstart --install ~/Downloads/app.apk\n'
printf 'Launch it with: apkstart <app-name>  (each app opens in its own window)\n'
