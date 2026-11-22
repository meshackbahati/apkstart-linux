#!/usr/bin/env bash
# Install ApkStart as a system command and initialise the chosen backend.
# Usage: apkstart install   (or: bash scripts/install.sh)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="${APKSTART_BACKEND:-waydroid}"

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
node -e "require('$ROOT/src/core/assoc').registerAssociation().then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e.message); process.exitCode = 1; })"

say "Installing the ApkStart desktop entry"
DESKTOP="$HOME/.local/share/applications/apkstart.desktop"
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=ApkStart
Comment=Run Android applications on the Linux desktop
Exec="$ROOT/bin/apkstart.js" --gui
Icon=$ROOT/assets/icon.png
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
Exec=$ROOT/bin/apkstart.js --controls edit
Terminal=false
Categories=Utility;Settings;
EOF
chmod 644 "$CONTROL_DESKTOP"

say "Initialising backend: $BACKEND"
apkstart init --backend "$BACKEND"

say "Done"
printf 'Commands:\n  apkstart --install <file.apk>\n  apkstart <app-name>\n  apkstart --list\n  apkstart init --check\n'
