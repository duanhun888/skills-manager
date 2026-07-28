Bundled OpenCode Desktop goes here at build time.

Run: powershell -ExecutionPolicy Bypass -File .\scripts\fetch-opencode-desktop.ps1

The .exe is gitignored; CI / joint-build fetches the pinned version from OPENCODE_VERSION.
