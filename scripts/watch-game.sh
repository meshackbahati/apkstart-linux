#!/usr/bin/env bash
# Watch a Waydroid game process and release keyboard capture when it exits.
# Usage: watch-game.sh <package> <adb-path> <serial>
set -u
PKG="$1"
ADB="$2"
SERIAL="$3"
USER_NAME="${USER:-$(id -un)}"

release() {
  sudo -n -g input -u "$USER_NAME" key2touch off >/dev/null 2>&1 || true
  exit 0
}
trap release INT TERM

for _ in $(seq 1 3600); do
  if ! "$ADB" -s "$SERIAL" shell "pidof $PKG" 2>/dev/null | tr -d '[:space:]' | grep -q .; then
    release
  fi
  sleep 2
done
release
