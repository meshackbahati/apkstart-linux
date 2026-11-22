#!/usr/bin/env bash
# Canonical ApkStart setup for the Waydroid backend on Linux.
# Idempotent: safe to run again after an update or a container reset.
# Called by: apkstart init --backend waydroid
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ID="$(. /etc/os-release 2>/dev/null && echo "${ID:-unknown}")"
USER_NAME="${SUDO_USER:-${USER:-$(id -un)}}"
SUDO="sudo"

say() { printf '\n==> %s\n' "$1"; }
run() { printf '+ %s\n' "$*"; "$@"; }
runroot() { printf '+ sudo %s\n' "$*"; $SUDO "$@"; }

say "Detected distribution: $ID; user: $USER_NAME"

case "$ID" in
  arch|manjaro|endeavouros|cachyos)
    runroot pacman -S --needed waydroid
    ;;
  debian|ubuntu|linuxmint|pop)
    if ! command -v waydroid >/dev/null 2>&1; then
      printf 'Waydroid is not packaged by this distribution. See https://docs.waydro.id/usage/install-on-desktops\n' >&2
      exit 1
    fi
    ;;
  fedora)
    runroot dnf install -y waydroid
    ;;
  *)
    printf 'Unsupported distribution: %s. Install Waydroid manually, then rerun this script.\n' "$ID" >&2
    exit 1
    ;;
esac

say "Enabling and initialising the Waydroid container"
runroot systemctl enable --now waydroid-container
if [ ! -f /var/lib/waydroid/images/system.img ]; then
  runroot waydroid init
fi

say "Starting a Waydroid session as $USER_NAME"
if ! waydroid status 2>/dev/null | grep -q 'Session:.*RUNNING'; then
  nohup waydroid session start >/tmp/opencode/apkstart-waydroid-setup.log 2>&1 &
  for _ in $(seq 1 30); do
    waydroid status 2>/dev/null | grep -q 'Session:.*RUNNING' && break
    sleep 1
  done
fi
waydroid status 2>&1 | head -6

say "Configuring the guest"
runroot waydroid prop set persist.waydroid.multi_windows true 2>/dev/null || true
runroot waydroid prop set show_ime_with_hard_keyboard 0 2>/dev/null || true

say "Installing keyboard-to-touch game controls"
if command -v yay >/dev/null 2>&1 && ! command -v key2touch >/dev/null 2>&1; then
  run yay -S --noconfirm key2touch-git
fi
if command -v key2touch >/dev/null 2>&1; then
  runroot usermod -aG input "$USER_NAME" 2>/dev/null || true
  # Narrow passwordless rules: only these exact commands may run without a
  # prompt, so ApkStart can wake an idle container and manage game controls.
  printf '%s ALL=(root) NOPASSWD: /usr/bin/lxc-unfreeze -P /var/lib/waydroid/lxc -n waydroid\n' "$USER_NAME" > /tmp/opencode/apkstart-unfreeze.rules
  printf '%s ALL=(:input) NOPASSWD: /usr/bin/key2touch\n' "$USER_NAME" > /tmp/opencode/apkstart-key2touch.rules
  runroot cp /tmp/opencode/apkstart-unfreeze.rules /etc/sudoers.d/apkstart-waydroid
  runroot cp /tmp/opencode/apkstart-key2touch.rules /etc/sudoers.d/apkstart-key2touch
  runroot chmod 440 /etc/sudoers.d/apkstart-waydroid /etc/sudoers.d/apkstart-key2touch
  K2T() { sudo -n -g input -u "$USER_NAME" key2touch "$@"; }
  if ! K2T profiles 2>/dev/null | grep -q universal; then
    K2T profile new universal >/dev/null 2>&1 || true
    # The output name is the first Wayland output; override with
    # `key2touch set output <name> -p universal` on multi-monitor systems.
    OUT="$(wayland-info 2>/dev/null | grep -m1 'name:' | awk '{print $2}' | tr -d ',')"
    [ -n "$OUT" ] && K2T set output "$OUT" -p universal >/dev/null 2>&1 || true
    K2T point add stick 28% 70% --keys w,a,s,d -p universal >/dev/null 2>&1 || true
    K2T point add tap space 85% 78% -p universal >/dev/null 2>&1 || true
    K2T point add tap enter 80% 53% -p universal >/dev/null 2>&1 || true
    K2T point add tap lmb 70% 88% -p universal >/dev/null 2>&1 || true
  fi
  K2T check -p universal --json 2>/dev/null | head -12
  printf 'Game controls are off by default. ApkStart enables them only while a game runs; press F2 in a game to edit the layout.\n'
fi

say "Authorising the bundled adb key with the guest"
if [ -f "/home/$USER_NAME/.android/adbkey.pub" ]; then
  sudo -n lxc-unfreeze -P /var/lib/waydroid/lxc -n waydroid 2>/dev/null || true
  KEY="$(base64 -w0 "/home/$USER_NAME/.android/adbkey.pub")"
  printf '%s\n' "$KEY" | runroot lxc-attach -P /var/lib/waydroid/lxc -n waydroid -- /system/bin/sh -c \
    "export PATH=/system/bin:/system/xbin; mkdir -p /data/misc/adb; echo '$KEY' | base64 -d > /data/misc/adb/adb_keys; chmod 600 /data/misc/adb/adb_keys; chown shell:shell /data/misc/adb/adb_keys; setprop ctl.start adbd" 2>/dev/null || true
else
  printf 'No adb key found yet. Run ApkStart once, then rerun init.\n'
fi

say "Selecting the Waydroid backend"
if command -v apkstart >/dev/null 2>&1; then
  run apkstart --backend waydroid
else
  run node "$ROOT/bin/apkstart.js" --backend waydroid
fi

say "Verification"
waydroid status 2>&1 | head -6
printf '\nSetup complete. Install an APK with: apkstart --install ~/Downloads/app.apk\n'
printf 'Launch it with: apkstart <app-name>\n'
