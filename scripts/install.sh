#!/usr/bin/env bash
# Install ApkStart as a system command and initialise the chosen backend.
# Usage: apkstart install   (or: bash scripts/install.sh)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="${APKSTART_BACKEND:-waydroid}"
# Desktop launchers do not load nvm or shell profiles, so pin the node and
# Electron binaries that exist now instead of relying on PATH at click time.
NODE_BIN="$(command -v node || true)"
ELECTRON_BIN="$ROOT/node_modules/electron/dist/electron"
ICON="$ROOT/build/store-assets/Square150x150Logo.png"

say() { printf '\n==> %s\n' "$1"; }

say "Installing the apkstart command"
if command -v npm >/dev/null 2>&1; then
  npm install -g "$ROOT" || {
    ln -sf "$ROOT/bin/apkstart.js" /usr/local/bin/apkstart
  }
else
  ln -sf "$ROOT/bin/apkstart.js" /usr/local/bin/apkstart
fi
command -v apkstart || { printf 'apkstart is not on PATH\n' >&2; exit 1; }

say "Registering APK file association"
if [ -x "$ELECTRON_BIN" ]; then
  # registerAssociation is synchronous and needs the program to run; without it
  # the handler is written with Exec="" and double-clicking an APK does nothing.
  node -e "try { console.log(JSON.stringify(require(process.argv[1]).registerAssociation(process.argv[2], process.argv[3], '\"' + process.argv[4] + '\"'))); } catch (e) { console.error(e.message); process.exitCode = 1; }" \
    "$ROOT/src/core/assoc" "$ELECTRON_BIN" "$ICON" "$ROOT"
else
  printf 'Electron is missing (%s); run npm install first. Skipping APK association.\n' "$ELECTRON_BIN" >&2
fi

say "Installing the ApkStart desktop entry"
DESKTOP="$HOME/.local/share/applications/apkstart.desktop"
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=ApkStart
Comment=Run Android applications on the Linux desktop
Exec="$NODE_BIN" "$ROOT/bin/apkstart.js" --gui
Icon=$ICON
Terminal=false
Categories=Utility;
EOF
chmod 644 "$DESKTOP"

CONTROL_DESKTOP="$HOME/.local/share/applications/apkstart-game-controls.desktop"
cat > "$CONTROL_DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=ApkStart Game Controls
Comment=Edit the universal keyboard and mouse controller for Android games
Exec="$NODE_BIN" "$ROOT/bin/apkstart.js" --controls edit
Icon=$ICON
Terminal=false
Categories=Utility;Settings;
EOF
chmod 644 "$CONTROL_DESKTOP"

say "Initialising backend: $BACKEND"
apkstart init --backend "$BACKEND"

say "Done"
printf 'Commands:\n  apkstart --install <file.apk>\n  apkstart <app-name>\n  apkstart --list\n  apkstart init --check\n'
