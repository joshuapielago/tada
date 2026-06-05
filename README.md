# TaDa!

TaDa! presents HTML files and URLs like slide decks. It is built for generated HTML decks from tools like Claude and Codex, but it also works with normal sectioned HTML documents.

## Run Locally

```bash
npm install
npm run electron:dev
```

The older browser prototype is still available with:

```bash
npm start
```

## Desktop Builds

```bash
npm run pack
npm run dist:mac
npm run dist:win
```

The production build config uses `electron-builder`:

- macOS: `dmg` and `zip`
- Windows: `nsis`
- Auto-update metadata: GitHub Releases in `joshuapielago/tada`

## Updates

The desktop app has an **Update** button. In development it reports that updates are only available in packaged builds. In a signed packaged build, it checks the configured release provider, downloads available updates, and changes to **Install** when an update is ready.

Production release details are in [docs/release.md](docs/release.md).
