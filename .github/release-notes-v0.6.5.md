# ApkStart Linux v0.6.5

This release consolidates the merged ATL and CLI work with the verification
improvements added after v0.6.4.

## Added

- Completed ATL client: installs, launches, cross-process stop, uninstall and
  crash logs now work through the same backend interface as the other runtimes.
- Offline ATL compatibility checks and a cross-distribution, resumable
  `setup-atl.sh` that builds on a clean host.
- `apkstart --uninstall <app>` for removing an application from the command line.
- APK v2 signature verification with `apkstart verify <apk> [--cert SHA256]`,
  signer pinning for updates, and per-split verification during installation.
- Stable `<package>.apk` launch names, per-app ATL data directories, remembered
  window sizes, SDK clamping, split operands and per-app ATL overrides.
- A version pin guard that keeps documentation, release notes and store package
  names aligned with `package.json`.

## Changed

- `settings.atl` holds per-app size, SDK, titlebar, mouse-as-touch and denied
  permission overrides. Vanilla ATL ignores the fork-only variables harmlessly.
- `APKSTART_ATL_REPO` and `APKSTART_ATL_COMMIT` allow pinning a maintained ATL
  fork while keeping ApkStart's own code MIT licensed.
- The English UI overlay accepts a glossary substitution only when a string is
  fully covered, avoiding mixed-language fragments.

## Verification boundary

The full Node suite, version pin guard, UI fixture build and CLI smoke checks
pass on Linux. Real APK fixtures were verified with the new signature checker,
including a negative test with a changed content byte. A real Waydroid or ATL
installation and an end-user desktop upgrade were not part of the automated
gate; release assets are verified by SHA-256 checksum before publication.
