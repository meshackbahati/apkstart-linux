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
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

say "Checking Node.js"
[ -n "$NODE_BIN" ] || die "Node.js 20 or newer is required (https://nodejs.org or your package manager)."
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] 2>/dev/null || die "Node.js $NODE_MAJOR found; version 20 or newer is required."

say "Installing dependencies"
if [ ! -d "$ROOT/node_modules" ]; then
  (cd "$ROOT" && npm install) || die "npm install failed."
fi
if [ ! -x "$ELECTRON_BIN" ]; then
  # The electron postinstall sometimes leaves dist/ with only locales/ (seen on
  # Node 24) although the zip in ~/.cache/electron is complete. Retry, then
  # unpack the cached zip directly.
  node "$ROOT/node_modules/electron/install.js" >/dev/null 2>&1 || true
  if [ ! -x "$ELECTRON_BIN" ]; then
    EVER="$(node -p "require('$ROOT/node_modules/electron/package.json').version")"
    ZIP="$(find "${ELECTRON_CACHE:-$HOME/.cache/electron}" -name "electron-v$EVER-linux-x64.zip" 2>/dev/null | head -1)"
    if [ -n "$ZIP" ] && command -v unzip >/dev/null 2>&1; then
      rm -rf "$ROOT/node_modules/electron/dist" && mkdir -p "$ROOT/node_modules/electron/dist"
      unzip -q "$ZIP" -d "$ROOT/node_modules/electron/dist" && printf 'electron' > "$ROOT/node_modules/electron/path.txt"
    fi
  fi
  [ -x "$ELECTRON_BIN" ] || die "Electron did not install. Remove node_modules and run npm install again."
fi

say "Installing the apkstart command"
# npm -g needs root with a system Node; fall back to ~/.local/bin, which needs none.
if ! npm install -g "$ROOT" >/dev/null 2>&1; then
  mkdir -p "$HOME/.local/bin"
  ln -sf "$ROOT/bin/apkstart.js" "$HOME/.local/bin/apkstart"
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) printf 'Add ~/.local/bin to PATH (e.g. in ~/.profile) to use the apkstart command.\n'
       export PATH="$HOME/.local/bin:$PATH" ;;
  esac
fi
command -v apkstart >/dev/null || die "apkstart is not on PATH."
printf 'apkstart %s\n' "$(apkstart --version)"

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
mkdir -p "$HOME/.local/share/applications"
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
if ! apkstart init --backend "$BACKEND"; then
  printf '\nThe %s backend is not ready yet; ApkStart still works with the built-in emulator.\n' "$BACKEND"
  printf 'Fix the message above, then run: apkstart init --backend %s\n' "$BACKEND"
fi

say "Done"
printf 'Commands:\n  apkstart --install <file.apk>\n  apkstart <app-name>\n  apkstart --list\n  apkstart init --check\n'
