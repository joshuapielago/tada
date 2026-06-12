# Tada Cloud HTML Deck Pastebin Design

## Goal

Build a Pastebin-like cloud publishing flow for HTML slide decks. A user or AI agent can publish an HTML deck with its assets and immediately receive an unlisted URL that anyone with the link can view in a polished hosted deck viewer.

The first version is built around speed and shareability: publish, get URL, send URL. Accounts, OAuth, private workspaces, analytics, editing, and deletion controls are future additions, not MVP requirements.

## Product Principle

The product should feel agent-native, not merely web-form-native. Human users can paste or drag files into a web UI, but the primary workflow is:

```bash
tada publish ./deck.html
```

which returns:

```text
https://tada.example/d/abc123
```

The same publish path must be available to AI apps through a small MCP server and to any script through an HTTP API.

## MVP Scope

The MVP publishes HTML decks as unlisted public artifacts.

Included:

- Upload one HTML deck and its required assets.
- Return a stable public-unlisted share URL.
- Serve a hosted viewer page for the deck.
- Preserve relative assets such as images, stylesheets, fonts, JavaScript, video, and audio.
- Provide a CLI command for publishing local files.
- Provide an MCP server with a minimal `publish_html_deck` tool.
- Provide a simple web UI for pasting self-contained HTML or uploading a ZIP bundle.
- Store a normalized deck bundle and a manifest for each publish.
- Apply basic size limits, MIME checks, path safety checks, and sandboxed rendering.

Excluded from MVP:

- OAuth or user accounts.
- Private access control.
- Deck editing.
- Version history.
- Analytics.
- GitHub or Google Drive storage workflows.
- PowerPoint or PDF import.
- Human review or moderation queues.

## Core User Flows

### CLI Publish From HTML File

The user runs:

```bash
tada publish ./deck.html
```

The CLI packages `deck.html` as `index.html`, finds referenced local assets, uploads a normalized bundle to the service, and prints the share URL. If assets are missing, the CLI warns before upload and can continue when the deck is still viewable.

### CLI Publish From ZIP

The user runs:

```bash
tada publish ./deck.zip
```

The CLI uploads the ZIP directly after validating that it contains an HTML entrypoint. This is the reliable fallback when automatic asset discovery is not enough.

### MCP Publish

An AI app calls:

```text
publish_html_deck(html, title?)
```

For raw HTML, the MCP server posts the HTML directly. For local files, the MCP server can expose a companion `publish_html_file(path, title?)` tool that runs the same packaging logic as the CLI and returns the same share URL shape.

### Web Publish

A human opens the site, pastes self-contained HTML or uploads a ZIP, and receives a share URL. The web UI is useful, but not the product's primary automation surface.

### View Shared Deck

A recipient opens:

```text
https://tada.example/d/abc123
```

The viewer loads the stored deck bundle, presents the deck in a sandboxed iframe, and provides slide navigation, fullscreen, fit controls, and basic error messages if the deck cannot be rendered.

## Architecture

The system has four surfaces that share one backend contract:

- Hosted viewer: renders published decks at `/d/:id`.
- Upload API: receives HTML or normalized bundles and returns share URLs.
- CLI publisher: packages local files and calls the upload API.
- MCP adapter: exposes AI-callable publish tools and calls the same upload API.

The backend should treat every deck as a normalized bundle:

```text
manifest.json
index.html
assets/...
```

The service stores bundle files in object storage and stores deck metadata in a small database. A Cloudflare-style architecture is a strong fit for the MVP: edge worker or lightweight Node service, object storage for bundle files, and a small key-value/database table for manifests and deck records. The design should not depend on a specific vendor in the API or CLI.

## Upload API

### Create Deck

```http
POST /api/decks
```

Accepted request forms:

- `multipart/form-data` with a normalized bundle ZIP.
- `application/json` with `{ "html": "...", "title": "..." }` for self-contained decks.

Response:

```json
{
  "id": "abc123",
  "viewUrl": "https://tada.example/d/abc123",
  "createdAt": "2026-06-13T00:00:00.000Z",
  "title": "Optional title"
}
```

The initial API does not require authentication. Rate limiting, upload size limits, and abuse controls are still required because unlisted public upload endpoints attract junk once exposed.

### Fetch Deck Manifest

```http
GET /api/decks/:id/manifest
```

Returns the normalized manifest needed by the viewer. This endpoint only exposes metadata required to render the deck.

### Fetch Deck Assets

```http
GET /api/decks/:id/files/*
```

Serves `index.html` and asset files from object storage using safe normalized paths. The service must reject path traversal and never serve files outside the deck bundle.

## Deck Manifest

Each publish stores a generated `manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "abc123",
  "title": "Optional title",
  "entrypoint": "index.html",
  "createdAt": "2026-06-13T00:00:00.000Z",
  "files": [
    {
      "path": "index.html",
      "contentType": "text/html",
      "bytes": 48213,
      "sha256": "..."
    }
  ],
  "warnings": []
}
```

The manifest is the contract between upload, storage, and viewer. Future account metadata should live outside this manifest so old bundles remain portable.

## Asset Packaging

The CLI and MCP file publisher should upload referenced assets plus a small safety net, not the entire containing folder by default.

The small safety net is limited to conventional sibling asset directories when they are below the deck root and below the upload limits:

- `assets/`
- `images/`
- `img/`
- `media/`
- `fonts/`
- `css/`
- `js/`

These directories are included only when they are direct siblings of the HTML file or when a referenced path already points into them. The packager still applies the hidden-file, secret, source-map, lockfile, and repo-metadata exclusions below.

The packager scans:

- HTML `src`, `href`, `poster`, `data`, and `srcset` attributes.
- `<link rel="stylesheet">`, preload, icon, and font references.
- CSS `url(...)` references in inline styles and local CSS files.
- Relative JavaScript module imports when statically discoverable.

The packager ignores:

- Absolute remote URLs.
- `data:` URLs already embedded in the document.
- Files outside the deck root unless the user explicitly allows them.
- Hidden files, secrets, source maps, lockfiles, and common repo metadata.

The default deck root is the HTML file's containing directory. Referenced files must resolve inside that root unless the user passes an explicit option allowing outside references.

Escape hatches:

```bash
tada publish ./deck.zip
tada publish ./deck-folder --all
```

`--all` is intentionally explicit because whole-folder upload can accidentally publish unrelated client files, drafts, credentials, or large media.

## CLI Design

The CLI command:

```bash
tada publish <path> [--title "..."] [--api-url "..."] [--all]
```

Behavior:

- If `<path>` is an HTML file, package it and referenced assets.
- If `<path>` is a ZIP file, validate and upload it.
- If `<path>` is a directory, require `--all` or an obvious `index.html`.
- Print the share URL as the final line so scripts and agents can capture it.
- Emit warnings to stderr and structured output with `--json`.

JSON output:

```bash
tada publish ./deck.html --json
```

```json
{
  "id": "abc123",
  "viewUrl": "https://tada.example/d/abc123",
  "warnings": []
}
```

## MCP Design

The MVP MCP server is a local adapter over the HTTP API, not a separate product backend.

Tools:

- `publish_html_deck`
  - Input: `html`, optional `title`.
  - Output: `id`, `viewUrl`, `warnings`.
- `publish_html_file`
  - Input: local `path`, optional `title`.
  - Output: `id`, `viewUrl`, `warnings`.

The MCP server should use the same packager library as the CLI. This keeps behavior consistent between Codex, Claude, shell scripts, and the web UI.

Remote OAuth-based MCP is a future milestone after accounts exist. The MVP should not block on remote MCP auth.

## Viewer Design

The hosted viewer should reuse the existing Tada presentation behavior where practical:

- Detect generated deck structures and existing slides.
- Fall back to splitting long HTML pages into slide-like sections.
- Render slides in an isolated iframe.
- Preserve deck styles and assets.
- Provide next, previous, first, last, fullscreen, and fit controls.
- Support keyboard and clicker navigation.

The viewer should load the deck's `index.html` from the bundle and rewrite relative asset resolution through the deck file route. It should not mutate stored HTML.

## Security And Abuse Controls

Even without accounts, the MVP needs basic protections:

- Random unguessable IDs with enough entropy to prevent enumeration.
- Upload size limit, initially 50 MB per deck.
- File count limit, initially 500 files per deck.
- Per-IP rate limits for anonymous uploads.
- MIME and extension allowlist for common web assets.
- Path normalization that rejects absolute paths and `..` traversal.
- HTML rendered in sandboxed iframes.
- No privileged cookies or credentials exposed to deck iframes.
- Optional server-side HTML scanning for obviously dangerous payloads later.

The system is public-unlisted, not private. Anyone with the link can view the deck.

## Error Handling

Publishing errors should be concise and actionable:

- No HTML entrypoint found.
- Referenced asset is missing.
- Bundle exceeds size limit.
- Unsupported file type.
- Path escapes deck root.
- Upload failed or timed out.

Viewer errors should keep the share page usable and explain whether the issue is missing deck data, missing assets, malformed HTML, or a rendering failure.

## Testing

Automated tests should cover:

- HTML asset reference discovery.
- CSS `url(...)` asset discovery.
- `srcset` parsing.
- ZIP validation and entrypoint detection.
- Path traversal rejection.
- Manifest generation.
- API create-deck response shape.
- Viewer asset URL resolution.
- Existing generated-deck detection in the viewer.

End-to-end tests should cover:

- Publish HTML file with local image and CSS assets.
- Publish ZIP with `index.html`.
- Publish raw self-contained HTML through JSON API.
- Open returned share URL and verify rendered slide content.
- Verify final CLI output is script-readable.

## Rollout Plan

1. Build the normalized bundle format and manifest generator.
2. Build CLI packaging for HTML files and ZIP upload.
3. Build the anonymous upload API and object storage persistence.
4. Build the hosted viewer route backed by stored bundles.
5. Add the minimal local MCP server using the same CLI packager library.
6. Add the simple web paste/upload UI.
7. Add rate limits, limits reporting, and production deployment configuration.

## Future Milestones

After the MVP proves useful:

- OAuth and owned deck history.
- Delete and expiration controls.
- Private decks and organization sharing.
- Remote MCP with OAuth.
- Custom domains.
- Deck versioning.
- Analytics and view counts.
- Screenshot or thumbnail generation.
- Password-protected links.
- API keys for automation.

## Success Criteria

The MVP is successful when a user or AI agent can publish a local HTML deck with assets, receive a URL in one command or tool call, send that URL to another person, and have the recipient view the deck without installing anything or signing in.
