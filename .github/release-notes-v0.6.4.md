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

## Verification boundary

The Node suite and the screenshot fixture were run on Linux before tagging.
No real Android device, KVM guest or package manager installation was part of
the automated gate; AppImage and `.deb` artifacts are verified by checksum,
not by an end-user desktop session.
