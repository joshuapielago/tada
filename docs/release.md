# TaDa! Release Guide

This app is configured for direct team distribution on macOS and Windows using `electron-builder` and `electron-updater`.

## Release Host

`package.json` currently uses GitHub Releases as the update provider:

```json
{
  "provider": "github",
  "owner": "joshuapielago",
  "repo": "tada"
}
```

The current release host is the public `joshuapielago/tada` repository. Keep it public for the simplest update flow, or switch to a generic HTTPS provider if the team needs private update hosting.

## Build Commands

```bash
npm install
npm test
npm run dist:mac
npm run dist:win
```

`npm run release` publishes artifacts and update metadata to the configured provider. Use it only after signing credentials are configured.

## macOS

macOS produces both `.dmg` and `.zip` artifacts. Keep both: the ZIP artifact is required by the macOS update flow, while the DMG is the normal installer users download.

Required production credentials:

```bash
export CSC_LINK=/path/to/developer-id-application.p12
export CSC_KEY_PASSWORD=...
export APPLE_ID=...
export APPLE_APP_SPECIFIC_PASSWORD=...
export APPLE_TEAM_ID=...
```

For CI, store those values as secrets. Do not commit certificates, passwords, or generated `dev-app-update.yml`.

## Windows

Windows uses the NSIS installer target because it is compatible with `electron-updater`.

Required production credentials:

```bash
export WIN_CSC_LINK=/path/to/windows-code-signing-cert.pfx
export WIN_CSC_KEY_PASSWORD=...
```

If the same signing certificate is used for all platforms, `CSC_LINK` and `CSC_KEY_PASSWORD` can be used instead.

## Publishing Flow

1. Bump `version` in `package.json`.
2. Run `npm test`.
3. Build locally with `npm run pack` for a quick unsigned packaging smoke test.
4. Build signed installers on the correct CI runner or release machine.
5. Publish with `npm run release`.
6. Install the previous version on a clean machine.
7. Click **Update** in TaDa! and confirm the update downloads and the **Install** action restarts into the new version.

## Known Production Prerequisites

- macOS Developer ID signing and notarization credentials.
- Windows code-signing certificate.
