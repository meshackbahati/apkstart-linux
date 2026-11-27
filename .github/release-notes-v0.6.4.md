# ApkStart Linux v0.6.4

This release makes the Linux build the primary target of the fork and adds a
configurable DNS policy, a reproducible UI screenshot fixture and a
Linux-first release pipeline.

## Added

- Configurable DNS servers in Settings → Performance and resources: domestic
  public DNS (default), Cloudflare, Google, or off. Configurations written
  before 0.6.4 keep working through the legacy `engine.fastDns` flag.
- `tools/ui-screenshot-fixture.js`: a deterministic, IPC-stubbed copy of the
  real UI for screenshots and documentation checks. It needs neither Electron
  nor an Android runtime.
- Linux-first release workflow: full Node suite, screenshot fixture and CLI
  smoke run before AppImage and `.deb` packages are built, then SHA-256
  checksums are verified before assets are uploaded.
- Waydroid is selected automatically on Linux once its binary and initialised
  image are present; an explicit backend selection still wins. The setup script
  supports Arch, Debian/Ubuntu, Fedora, openSUSE and Void, with Wayland and
  binder preflight and root-owned sudoers rules.

## Changed

- Repository identity now points at `meshackbahati/apkstart-linux`; the
  upstream author is credited as the original creator.
- The About panel and update source now describe this Linux fork rather than
  the upstream Windows project.
- The English UI overlay no longer emits mixed-language fragments: glossary
  substitution is accepted only when a string is fully covered, and common
  status phrases gained exact translations.
- Documentation was reorganised around Linux installation, usage, screenshots
  and release procedures.
- Emulator adoption, `--stop-runtime` and downloads were repaired on Linux:
  running emulators are discovered through the port probe, the `emulator-<port>`
  serial is preferred, `ss` replaces Windows `netstat`, and each resolved
  address gets five seconds instead of Node's 250 ms default.

## Verification boundary

The Node suite and the screenshot fixture were run on Linux before tagging.
No real Android device, KVM guest or package manager installation was part of
the automated gate; AppImage and `.deb` artifacts are verified by checksum,
not by an end-user desktop session.
