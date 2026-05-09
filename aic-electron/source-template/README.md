# CortexLog writable source (template)

This folder is bundled with the packaged app and copied to your app data directory
on first launch so the **Modify Engine** (Cursor CLI) can work against a writable
Git workspace—not the read-only install location.

- **Do not** put journal entries or API keys here; those stay in the app database / secret store.
- Version: see `template_version.json`.
