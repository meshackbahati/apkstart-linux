'use strict';
/**
 * Offline compatibility check for the Android Translation Layer backend.
 *
 * ATL runs the app's Dalvik bytecode on the host and loads its native
 * libraries directly through bionic_translation. There is no CPU translation,
 * no Google Play services, no Binder and only a partial framework, so some
 * APKs cannot work no matter how ATL is built. This module reads the APK
 * (never executes it) and reports:
 *
 *   verdict 'blocked' : cannot run on this host (for example ARM-only native code)
 *   verdict 'risky'   : depends on something ATL does not provide; may start but break
 *   verdict 'likely'  : nothing known to be missing
 *   severity 'info'   : worth knowing, never changes the verdict
 *
 * The scan is cheap: it lists ZIP entries and searches dex and manifest bytes
 * for well-known class and library names.
 */
const os = require('os');
const { ZipFile } = require('./zip');

/** Native ABI names Android uses, keyed by Node's process.arch. */
const HOST_ABI = { x64: 'x86_64', ia32: 'x86', arm64: 'arm64-v8a', arm: 'armeabi-v7a' };

/** Markers searched for in classes*.dex and AndroidManifest.xml (as UTF-8 and UTF-16LE). */
const DEX_MARKERS = [
  {
    id: 'play-services',
    needle: 'Lcom/google/android/gms/',
    severity: 'risky',
    message: 'Uses Google Play services, which ATL does not provide (sign-in, maps, location and similar features will fail).',
  },
  {
    id: 'firebase-messaging',
    needle: 'Lcom/google/firebase/messaging/',
    severity: 'risky',
    message: 'Uses Firebase Cloud Messaging; push notifications will not arrive.',
  },
  {
    id: 'play-licensing',
    needle: 'Lcom/android/vending/licensing/',
    severity: 'risky',
    message: 'Checks a Google Play licence, which cannot be verified without the Play Store.',
  },
  {
    id: 'play-integrity',
    needle: 'Lcom/google/android/play/core/integrity/',
    severity: 'risky',
    message: 'Uses Play Integrity; apps that require it will refuse to run.',
  },
  {
    id: 'drm',
    needle: 'Landroid/media/MediaDrm;',
    // Media libraries such as ExoPlayer reference MediaDrm even when the app
    // never plays protected content, so this is informational only.
    severity: 'info',
    message: 'References MediaDrm; protected (DRM) video will not play.',
  },
];

/** Native libraries that indicate a game engine or a renderer ATL rarely supports. */
const LIB_MARKERS = [
  { re: /\/libunity\.so$/, id: 'unity', message: 'Unity game engine: needs full EGL and GLES support, which ATL only partly provides.' },
  { re: /\/libUE4\.so$|\/libUnreal\.so$/, id: 'unreal', message: 'Unreal Engine game: not expected to render under ATL.' },
  { re: /\/libgodot_android\.so$/, id: 'godot', message: 'Godot game engine: rendering under ATL is unverified.' },
  { re: /\/libcocos2d[^/]*\.so$/, id: 'cocos2d', message: 'Cocos2d game engine: rendering under ATL is unverified.' },
  { re: /\/libflutter\.so$/, id: 'flutter', message: 'Flutter app: the engine needs EGL/GLES surfaces that ATL only partly provides.' },
];

const MAX_SCAN = 64 * 1024 * 1024;

function hostAbi(arch = process.arch) {
  return HOST_ABI[arch] || arch;
}

/** ABIs present under lib/<abi>/ in a ZIP listing. */
function abisFrom(names) {
  const set = new Set();
  for (const n of names) {
    const m = /^lib\/([^/]+)\/[^/]+\.so$/.exec(n);
    if (m) set.add(m[1]);
  }
  return [...set].sort();
}

/** True when buf contains needle encoded as UTF-8 or UTF-16LE. */
function contains(buf, needle) {
  if (!buf || !buf.length) return false;
  if (buf.indexOf(needle, 0, 'utf8') !== -1) return true;
  return buf.indexOf(Buffer.from(needle, 'utf16le')) !== -1;
}

/**
 * Pure verdict from already extracted facts, so tests and other callers do
 * not need a real APK. `facts` = { names: [zip entry names], blobs: [Buffer], arch }.
 */
function assess({ names = [], blobs = [], arch = process.arch } = {}) {
  const issues = [];
  const abis = abisFrom(names);
  const host = hostAbi(arch);

  if (abis.length && !abis.includes(host)) {
    issues.push({
      id: 'abi',
      severity: 'blocked',
      message: `Native code is only built for ${abis.join(', ')}; this computer needs ${host}. ATL cannot translate CPU instructions.`,
    });
  }

  for (const m of DEX_MARKERS) {
    if (blobs.some((b) => contains(b, m.needle))) {
      issues.push({ id: m.id, severity: m.severity, message: m.message });
    }
  }

  const seen = new Set();
  for (const n of names) {
    for (const m of LIB_MARKERS) {
      if (!seen.has(m.id) && m.re.test(n)) {
        seen.add(m.id);
        issues.push({ id: m.id, severity: 'risky', message: m.message });
      }
    }
  }

  const verdict = issues.some((i) => i.severity === 'blocked') ? 'blocked'
    : (issues.some((i) => i.severity === 'risky') ? 'risky' : 'likely');
  return { verdict, abis, hostAbi: host, issues };
}

/** Read an APK from disk and assess it. Never throws: unreadable input yields verdict 'unknown'. */
function checkApk(filePath, { arch = process.arch } = {}) {
  let zip;
  try {
    zip = new ZipFile(filePath);
    const names = zip.names();
    const blobs = [];
    let budget = MAX_SCAN;
    const scan = names.filter((n) => /^classes\d*\.dex$/.test(n) || n === 'AndroidManifest.xml');
    for (const n of scan) {
      if (budget <= 0) break;
      try {
        const b = zip.read(n);
        budget -= b.length;
        blobs.push(b);
      } catch (_) { /* oversized or unsupported entry: skip it */ }
    }
    return { file: filePath, ...assess({ names, blobs, arch }) };
  } catch (e) {
    return { file: filePath, verdict: 'unknown', abis: [], hostAbi: hostAbi(arch), issues: [], error: e.message };
  } finally {
    if (zip) zip.close();
  }
}

/** One-line summary for logs and the command line. */
function describe(result) {
  if (!result) return '';
  const head = {
    likely: 'ATL: no known blockers',
    risky: 'ATL: may start but some features will not work',
    blocked: 'ATL: cannot run on this computer',
    unknown: 'ATL: compatibility could not be checked',
  }[result.verdict] || `ATL: ${result.verdict}`;
  const lines = [head, ...result.issues.map((i) => `  - ${i.message}`)];
  return lines.join(os.EOL);
}

module.exports = {
  checkApk, assess, describe, abisFrom, hostAbi, contains, DEX_MARKERS, LIB_MARKERS,
};
