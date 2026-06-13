# Tada Cloud HTML Deck Pastebin Design

## Goal

Build a Pastebin-like cloud upload flow for HTML slide decks. A user or AI agent can upload an HTML deck with its assets and immediately receive an unlisted URL that anyone with the link can view in a polished hosted deck viewer.

The first version is built around speed and shareability: upload, get URL, send URL. Accounts, OAuth, private workspaces, public/user-facing analytics, editing, and deletion controls are future additions, not MVP requirements. A lightweight internal Admin Console is included so operators can see whether the product is functioning during the private alpha.

Even during private alpha, upload creation surfaces are publicly callable by default. Web upload, raw API, CLI, and server-side MCP do not require an alpha key or user account; abuse control comes from upload limits, rate limits, Upload Certification, reporting, and internal operational review. The product may be quietly shared rather than publicly marketed, but the core upload path should behave like the eventual anonymous product.

## Product Principle

The product should feel agent-native, not merely web-form-native. Human users can paste or drag files into a web UI, but the primary workflow is:

```bash
tada upload ./deck.html
```

which returns:

```text
https://tada.fm/d/abc123
```

The same upload path must be available to AI apps through a server-side MCP server and to any script through an HTTP API.

## MVP Scope

The MVP uploads HTML decks as unlisted public artifacts.

Included:

- Upload one HTML deck and its required assets.
- Return a stable public-unlisted share URL.
- Serve a hosted viewer page for the deck.
- Preserve relative assets such as images, stylesheets, fonts, JavaScript, video, and audio.
- Provide a CLI command for uploading local files.
- Provide a server-side MCP server with a minimal `upload_html_deck` tool.
- Provide minimal API documentation for private-alpha users and agents.
- Provide a simple web UI for pasting self-contained HTML, uploading one `.html` file, or uploading from a public URL.
- Store a normalized deck bundle and a manifest for each upload.
- Generate a best-effort thumbnail asynchronously after upload.
- Provide a lightweight internal Admin Console for read-only report review, recent deck records, and operational metrics.
- Apply basic size limits, MIME checks, path safety checks, and sandboxed rendering.

Excluded from MVP:

- OAuth or user accounts.
- Private access control.
- Deck editing.
- Version history.
- Public/user-facing analytics.
- GitHub or Google Drive storage workflows.
- PowerPoint or PDF import.
- Custom domains.

## Core User Flows

### CLI Upload From HTML File

The user runs:

```bash
tada upload ./deck.html
```

The CLI packages `deck.html` as `index.html`, finds referenced local assets, uploads a normalized bundle to the service, and prints the share URL. If assets are missing, the CLI warns before upload and can continue when the deck is still viewable.

### CLI Upload From Prepared Bundle

The user runs:

```bash
tada upload ./deck-folder --all
```

The CLI uploads a prepared folder after validating that it contains an HTML entrypoint. This is the reliable fallback when automatic asset discovery is not enough.

### MCP Upload

An AI app calls:

```text
upload_html_deck(html, title?)
```

For raw HTML, the MCP server posts the HTML directly. For file uploads, the MCP server accepts MCP-provided file content or bytes and returns the same share URL shape. Local path packaging remains the CLI's job unless the MCP client can explicitly provide file bytes.

### Web Upload

A human opens the site, pastes self-contained HTML, uploads one `.html` file, or provides a public URL to an HTML entrypoint, then receives a share URL. The web UI is useful, but not the product's primary automation surface.

The `/upload` page should be a focused tool page, not a marketing page. The first screen should center the upload action with three input paths: paste HTML, drop/select one `.html` file, or paste a public URL. Keep explanatory copy minimal and close to the action.

For the first working version, the homepage may default to the same upload experience. Homepage positioning, marketing copy, and broader site structure are intentionally deferred for separate iteration; the core product path takes priority.

The first usable version must include all primary upload surfaces: web upload, raw HTTP API, CLI, and MCP. MCP is part of the initial agent-native product, not a post-MVP adapter.

The first usable version should include a minimal public API documentation page, such as `/docs/api`, covering raw HTML upload, URL Upload, response shape, typed errors, warnings, notices, Upload Certification requirements, and server-side MCP usage. The docs should include copy-paste examples for `curl`, `tada upload`, and MCP tool calls, not just endpoint reference tables. This is not a full developer portal.

The API docs should advertise the exact hosted MCP endpoint once implemented, rather than only describing MCP conceptually, so AI app setup can be copy-pasteable from the start.

The upload page should include a low-emphasis link to `/docs/api`, labeled around API/MCP docs, so agent and automation workflows are discoverable without distracting from the upload action.

After web upload succeeds, stay on an upload result state rather than auto-navigating to the viewer. The result should show the Share URL, copy action, open-deck action, and uploader-facing warnings/notices. The result may poll Deck Metadata and show the Deck Thumbnail when it becomes ready, but it must remain useful while the thumbnail is pending or failed.

Anonymous upload result pages are transient UI states, not durable management pages. The durable shareable URL is the Published Deck Share URL at `/d/:id`; future authenticated dashboards can provide durable management pages for owned decks.

The anonymous web upload UI should include lightweight inline copy near the upload action: uploads are unlisted, and anyone with the link can view them.

Upload success requires a usable HTML entrypoint, safe bundle paths, stored files, and written Published Deck metadata. Upload success does not wait for Deck Engine slide extraction, Deck Thumbnail generation, remote asset validation, or complete viewer rendering. The Viewer Shell is responsible for falling back to Original Mode if Slides Mode cannot render the deck well.

The web upload UI should include Upload Certification copy near the upload action: by uploading, the uploader confirms they have the rights to share the deck and its assets, and that anyone with the link may view it. CLI, MCP, and API documentation should include the same certification language. Anonymous web and raw API uploads must require `certifyRights: true` or the equivalent explicit UI confirmation before creating a Published Deck.

The upload result should also include a Source Visibility Notice: Tada does not offer a recipient-facing download button in the MVP, but uploaded HTML and asset files are public-unlisted web content required for rendering and may be inspected or fetched by recipients with the link.

The upload result should include a Deck Runtime Warning alongside the Share URL when Tada detects during upload that the uploaded deck appears to contain its own navigation, presentation runtime, or script-driven slide behavior. This warning should explain that Slides Mode may adapt or neutralize conflicting runtime behavior, and that Original Mode is available as a fallback. It is not a pre-upload blocker.

### URL Upload

The user provides a public URL. Tada fetches the HTML entrypoint at that URL, creates a Published Deck, and returns a Share URL. In the MVP, URL Upload fetches the entrypoint only; linked remote images, stylesheets, scripts, fonts, video, and audio remain remote dependencies. The upload response should warn when remote dependencies are present.

URL Upload requires a public URL that resolves to HTML. The MVP does not provide Google Drive authentication, folder import, or special handling for private Drive links. Public Google Drive links may work only when they resolve to downloadable HTML.

URL Upload fetches server-side so browser CORS does not block uploads and CLI/MCP/API behavior stays consistent. The server must reject non-HTTP schemes, private or internal network targets, localhost, link-local metadata hosts, and responses that are not HTML-like or exceed upload limits.

URL Upload may follow up to three redirects. Each redirect target must pass the same public HTTP/HTTPS safety checks as the original URL.

### View Shared Deck

A recipient opens:

```text
https://tada.fm/d/abc123
```

The viewer loads the stored deck bundle, presents the deck in a sandboxed iframe, and provides slide navigation, fullscreen, fit controls, and basic error messages if the deck cannot be rendered.

Upload warnings are uploader-facing only. They may appear in CLI, MCP, API, or upload-result UI responses, but they should not appear inside the recipient's viewer or presentation mode.

The `/d/:id` viewer route should not show upload warnings or notices even when opened by the uploader immediately after upload. Warnings and notices belong to upload results, CLI, MCP, and API metadata surfaces.

The normal, non-presenting Viewer Shell should include a low-emphasis Report Link for abuse, copyright, or policy concerns. The report flow should prefill the Published Deck URL or ID and collect a reason plus optional contact email. Presentation Mode should not show the Report Link.

Submitting a report should create a review record and should not automatically hide, remove, or throttle the Published Deck in the MVP.

The MVP should include a lightweight internal Admin Console for operators to observe product function during the private alpha. It should support:

- Reviewing submitted reports with deck ID, Share URL, reason, optional reporter email, and timestamp.
- Viewing recent read-only deck records with deck ID, title, created time, source type, upload surface, warning/notice counts, thumbnail status, and clickable Share URL.
- Expanding or opening a recent deck record to inspect typed warning and notice details without cluttering the default table.
- Seeing recent upload activity and failure counts.
- Seeing upload volume and failures broken down by upload surface: web, CLI, server-side MCP, raw API, and URL Upload.
- Seeing thumbnail generation status/failure counts.
- Seeing thumbnail queue health, including pending thumbnail count and oldest pending thumbnail age.
- Seeing URL Upload failure counts.
- Seeing aggregate upload volume over a simple recent time window.
- Excluding deck view counts from MVP admin metrics; view analytics remain future product work.
- Avoiding successful deck-open telemetry in v1. Log viewer/server failures needed for debugging, but do not collect per-view analytics until that product surface is designed.
- Showing aggregate viewer failure metrics, such as missing deck records, missing content files, and slide extraction failures, without tracking successful views.
- Separating Slides Mode fallback events from hard viewer failures. If Slides Mode fails but Original View works, count it as a Deck Engine fallback signal rather than a failed view.
- Seeing simple cost-sensitive operational counts, such as total stored file bytes, uploaded deck count, thumbnail attempt count, and thumbnail failure count.

The Admin Console is internal operational tooling, not a Deck Owner dashboard, moderation queue, or public analytics surface. Public/user-facing analytics, view counts, and owner-facing deck history remain future product work.

For the prototype, the Admin Console may be protected by a simple secret route, shared admin token, or equivalent deployment-level guard instead of full account authentication. It must not be publicly discoverable as an unauthenticated route.

The MVP Admin Console is observe-only. Hiding, removing, throttling, resolving, or otherwise actioning reports and decks remains second-version work.

The returned Share URL should use `tada.fm` as the canonical product and viewer domain. Short domains such as `tda.bz`, `tda.cx`, or `tda.cc` may redirect to canonical Share URLs, but they are not the canonical location of a Published Deck. The `/d/:id` viewer should keep the deck dominant and should not include marketing navigation. Normal viewer mode may include low-emphasis Tada branding or an `Upload a deck` entry point; presentation mode must be deck-first and CTA-free.

The Share URL should include link preview metadata for messaging apps and social surfaces. Before a Deck Thumbnail is ready, previews use the Deck Title and Tada site name.
Deck Thumbnail generation is part of the MVP, but it is asynchronous and best-effort. The thumbnail should capture only the first extracted slide content, without Viewer Shell chrome, as a PNG image in a 16:9 preview frame. The slide itself should be contain-fit within that frame using the deck's detected Deck Aspect Ratio rather than destructive cropping. Upload success must not wait for screenshot rendering. If a Deck Thumbnail is not ready or fails, link previews fall back to title-based metadata.

The thumbnail worker should capture an internal Thumbnail Render Route rather than the public Viewer Shell. This route renders only first-slide content at the fixed thumbnail viewport and excludes viewer chrome, upload CTAs, recipient controls, and analytics noise.

Thumbnail jobs should use the queue's normal retry behavior. If thumbnail generation still fails after retries, Tada should record the failure internally and continue using title-based link preview metadata without showing recipient-facing errors.

Thumbnail rendering should wait for the first-slide render route to become visually ready by waiting for the slide frame, available font readiness, and a network-idle or short settle condition. The thumbnail worker should use a product-level hard timeout of roughly 8-10 seconds per attempt, then either capture the best available first-slide image or fail the thumbnail job for retry.

Thumbnail Status is API and metadata state, not recipient viewer state. The Viewer Shell should not show pending or failed thumbnail status to recipients.

Published Deck Share URLs are unlisted and `noindex` by default. Search indexing should require a future explicit Public Deck choice by a Deck Owner.

Published Decks should be permanent by default in v1. There is no automatic expiry or retention cleanup for old or unviewed decks. Storage growth should be observed through internal Operational Metrics, then revisited once real usage and cost patterns exist.

Future editable URLs should be implemented as a separate Share Alias layer. The canonical `/d/:id` Share URL continues to identify an immutable Published Deck forever, while authenticated Deck Owners may later create or edit human-facing aliases that point to a chosen Published Deck version.

## Architecture

The system has four surfaces that share one backend contract:

- Hosted viewer: renders uploaded decks at `/d/:id`.
- Upload API: receives HTML or normalized bundles and returns share URLs.
- CLI uploader: packages local files and calls the upload API.
- Server-side MCP server: exposes AI-callable upload tools and calls the same upload API.

Tada Cloud should live in the existing `tada` repo and move the codebase toward a monorepo-style structure as needed. The cloud app, CLI, server-side MCP server, uploader, and desktop app should share portable packages rather than drifting across separate repositories.

The first cloud implementation should avoid a broad Electron/desktop file move. Keep the current desktop structure in place, extract shared Deck Engine and uploader pieces as needed, and add cloud packages/apps gradually.

New cloud, CLI, MCP, uploader, API contract, and manifest code should be TypeScript. Existing desktop JavaScript should remain as-is during the first cloud implementation unless a specific shared extraction requires a narrow change.

The first cloud implementation should wrap the existing tested `src/shared/deckify.js` Deck Engine instead of rewriting it in TypeScript immediately. Migrate the Deck Engine itself to TypeScript later, after the cloud upload/view path is stable.

The uploader/packager should live in its own TypeScript package from day one so CLI and MCP share identical asset discovery, manifest generation, warnings/notices, and multipart upload preparation.

Create a small TypeScript contracts package for shared API and manifest types such as `DeckManifest`, `UploadWarning`, `UploadNotice`, `CreateDeckResponse`, and `DeckMetadata`. Use Zod for shared runtime validation and inferred TypeScript types so cloud, CLI, MCP, and uploader code stay aligned at API boundaries.

Routine engineering choices should follow conservative defaults that fit the existing repo and platform. Escalate technical decisions for product review only when they materially affect user experience, cost, security posture, deployment risk, or future product flexibility.

Minor product defaults such as exact low-emphasis link placement, small docs-copy choices, and obvious implementation details should not block the first working version. Default them conservatively and reserve product review for decisions that materially affect the core upload/share/view workflow, trust and safety, cost, security, or future flexibility.

The backend should treat every deck as a normalized bundle:

```text
manifest.json
index.html
assets/...
```

The service stores bundle files in object storage and stores deck metadata in a small database. A Cloudflare-style architecture is a strong fit for the MVP: edge worker or lightweight Node service, object storage for bundle files, and a small key-value/database table for manifests and deck records. The design should not depend on a specific vendor in the API or CLI.

Deck Content files should be served from `content.tada.fm`, separate from the trusted `tada.fm` Viewer Shell and account surfaces.

Deck metadata storage should include a nullable `ownerId` or equivalent owner reference from the start. Anonymous MVP uploads store `null`; future authenticated uploads can use the field without changing the core Published Deck model.

Anonymous uploads should remain Ownerless Decks rather than becoming claimable later by default. When accounts exist, ownership begins when a deck is uploaded while authenticated. If Tada ever supports claiming an anonymous upload, it should require a deliberately designed one-time claim token created at upload time; possession of the public Share URL alone must never prove ownership.

## Upload API

### Create Deck

```http
POST /api/decks
```

Accepted request forms:

- `multipart/form-data` with a manifest field, normalized deck files, and `certifyRights: true`.
- `application/json` with `{ "html": "...", "title": "...", "certifyRights": true }` for self-contained decks.
- `application/json` with `{ "sourceUrl": "https://...", "title": "...", "certifyRights": true }` for URL Upload.

Response:

```json
{
  "id": "abc123",
  "viewUrl": "https://tada.fm/d/abc123",
  "createdAt": "2026-06-13T00:00:00.000Z",
  "title": "Optional title",
  "visibility": "unlisted",
  "manageable": false,
  "aspectRatio": { "width": 16, "height": 9 },
  "thumbnailStatus": "pending"
}
```

Successful uploads should return `201 Created` because the Published Deck exists and is viewable immediately. Background thumbnail generation should be represented by `thumbnailStatus`, not by changing the upload response to `202 Accepted`.

The initial API does not require authentication or an alpha access key. Rate limiting, upload size limits, and abuse controls are still required because unlisted public upload endpoints attract junk once exposed.

Rate-limit responses should be clear and machine-readable across API, CLI, and MCP surfaces:

```json
{
  "error": {
    "code": "rate-limited",
    "message": "Too many uploads. Try again shortly.",
    "retryAfterSeconds": 60
  }
}
```

All API errors should use the same typed error envelope so CLI, MCP, and agents can handle failures consistently:

```json
{
  "error": {
    "code": "upload-too-large",
    "message": "Deck exceeds the 50 MB anonymous upload limit.",
    "details": {}
  }
}
```

### Fetch Deck Metadata

```http
GET /api/decks/:id
```

Returns API-visible Deck Metadata for upload result UIs, agents, scripts, and future dashboards:

```json
{
  "id": "abc123",
  "viewUrl": "https://tada.fm/d/abc123",
  "createdAt": "2026-06-13T00:00:00.000Z",
  "title": "Optional title",
  "visibility": "unlisted",
  "manageable": false,
  "aspectRatio": { "width": 16, "height": 9 },
  "thumbnailStatus": "ready",
  "thumbnailUrl": "https://tada.fm/api/decks/abc123/thumbnail",
  "warnings": [],
  "notices": []
}
```

This endpoint is the polling surface for asynchronous Deck Thumbnail status. Thumbnail state should not be shown in the recipient Viewer Shell just because it is available through Deck Metadata.

Warnings are typed objects so web UI, CLI, MCP, and agents can handle them without parsing prose:

```json
{
  "code": "deck-runtime",
  "message": "This deck appears to include its own navigation. Slides Mode may adapt it; Original Mode is available."
}
```

MVP warning codes:

- `remote-assets`: remote asset dependencies were detected, not bundled, and not validated.
- `missing-assets`: local referenced assets were missing from the uploaded bundle.
- `deck-runtime`: embedded navigation, presentation runtime, or script-driven slide behavior was detected.

MVP notice codes:

- `source-visible`: uploaded HTML and asset files may be inspected or fetched by recipients with the link.
- `anonymous-ownerless`: anonymous uploads cannot be deleted or managed.

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

Deck Content file responses from `content.tada.fm` should use long-lived immutable caching because Published Decks are immutable. Viewer Shell routes, API metadata, and pending thumbnail responses should remain short-cache or revalidated.

### Fetch Deck Thumbnail

```http
GET /api/decks/:id/thumbnail
```

Serves the generated PNG Deck Thumbnail through a stable `tada.fm` URL. This endpoint should proxy the stored thumbnail from R2 or return a title-based fallback image if the thumbnail is not ready. Open Graph metadata should use this stable absolute Thumbnail URL rather than exposing raw storage paths.

Ready thumbnail responses should use long-lived immutable caching, such as `Cache-Control: public, max-age=31536000, immutable`, because Published Decks are immutable. Pending or fallback thumbnail responses should use short caching or revalidation so link preview clients can later see the generated thumbnail.

## Deck Manifest

Each upload stores a generated `manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "abc123",
  "title": "Optional title",
  "aspectRatio": { "width": 16, "height": 9 },
  "entrypoint": "index.html",
  "createdAt": "2026-06-13T00:00:00.000Z",
  "source": {
    "type": "url",
    "sourceUrl": "https://example.com/deck.html",
    "finalUrl": "https://example.com/deck.html",
    "fetchedAt": "2026-06-13T00:00:00.000Z"
  },
  "files": [
    {
      "path": "index.html",
      "contentType": "text/html",
      "bytes": 48213,
      "sha256": "..."
    }
  ],
  "warnings": [],
  "notices": []
}
```

The manifest is the contract between upload, storage, and viewer. Future account metadata should live outside this manifest so old bundles remain portable.

Source metadata is useful for debugging and relative asset resolution, but the Viewer Shell should not display the original source URL to recipients by default.

The manifest may reference a generated Deck Thumbnail once the asynchronous thumbnail job completes. Missing thumbnails are not errors.

## Asset Packaging

The CLI and MCP file uploader should upload referenced assets plus a small safety net, not the entire containing folder by default.

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

Absolute remote URLs remain in the deck HTML and are not fetched or copied during MVP upload. The uploader-facing response should warn when remote asset dependencies are present, but the MVP should not validate remote URL availability or report 404s.

For URL Upload, Tada may inject or preserve a base URL so relative remote assets resolve against the original source URL. URL Upload must not crawl the source site or snapshot linked assets in the MVP.

The default deck root is the HTML file's containing directory. Referenced files must resolve inside that root unless the user passes an explicit option allowing outside references.

Escape hatches:

```bash
tada upload ./deck-folder --all
```

`--all` is intentionally explicit because whole-folder upload can accidentally share unrelated client files, drafts, credentials, or large media.

## CLI Design

The CLI command:

```bash
tada upload <path> [--title "..."] [--api-url "..."] [--all]
```

Behavior:

- If `<path>` is an HTML file, package it and referenced assets.
- If `<path>` is an `http://` or `https://` URL, call the URL Upload API.
- If `<path>` is a prepared directory, validate and upload it when `--all` is supplied.
- If `<path>` is a directory, require `--all` or an obvious `index.html`.
- Print the share URL as the final line so scripts and agents can capture it.
- Print warnings and notices to stderr, including the anonymous unlisted/not-deletable notice.
- Keep upload non-interactive by default; running the command implies Upload Certification through CLI help, docs, and output copy.
- Keep stdout clean, with the Share URL as the final stdout line in default mode.
- Keep default output almost silent: only warnings/notices on stderr when needed and the Share URL on stdout. Add verbose progress output later behind `--verbose` if needed.
- In `--json` mode, emit the complete structured result on stdout, including warnings and notices, without duplicating them as human text on stderr. Reserve stderr in `--json` mode for true progress, debug, or error diagnostics.

JSON output:

```bash
tada upload ./deck.html --json
```

```json
{
  "id": "abc123",
  "viewUrl": "https://tada.fm/d/abc123",
  "visibility": "unlisted",
  "manageable": false,
  "thumbnailStatus": "pending",
  "warnings": [],
  "notices": []
}
```

## MCP Design

The first usable version includes a server-side MCP server, not a local-only MCP adapter. The server-side MCP server exposes Tada upload tools directly to AI clients and uses the same upload API, contracts, certification rules, warning/notice vocabulary, and uploader behavior as the web and CLI surfaces.

Tools:

- `upload_html_deck`
  - Input: `html`, `certifyRights: true`, optional `title`.
  - Output: `id`, `viewUrl`, typed `warnings`, typed `notices`.
- `upload_html_file`
  - Input: file bytes or MCP-provided file content, filename, `certifyRights: true`, optional `title`.
  - Output: `id`, `viewUrl`, typed `warnings`, typed `notices`.
- `upload_html_url`
  - Input: public `sourceUrl`, `certifyRights: true`, optional `title`.
  - Output: `id`, `viewUrl`, typed `warnings`, typed `notices`.

MCP upload tools must require explicit Upload Certification because agents call these tools on a user's behalf.

For raw HTML and URL Upload, the server-side MCP can call the upload API directly. For local-file upload, clients that cannot provide file contents should use the CLI or an MCP client capability that can pass file bytes; the server-side MCP should not assume it can read arbitrary paths from a user's machine.

The first server-side MCP does not require user accounts or an alpha access key. Server-side MCP starts anonymous, follows the same rate limits, size limits, Upload Certification requirements, warnings, and notices as the public API, and creates Ownerless Decks. OAuth-based MCP authorization and owned-deck management are future milestones after accounts exist, but the hosted MCP endpoint itself is part of the initial agent-native product.

Anonymous server-side MCP should be open to any MCP client in the first usable version rather than using a client allowlist. Abuse control should come from the same anonymous rate limits, upload limits, and certification requirements that apply to the public API.

## Viewer Design

The hosted viewer should reuse the existing Tada presentation behavior where practical:

- Detect generated deck structures and existing slides.
- Fall back to splitting long HTML pages into slide-like sections.
- Render slides in an isolated iframe.
- Preserve deck styles and assets.
- Provide next, previous, first, last, fullscreen, and slide count controls.
- Support keyboard and clicker navigation.
- Support basic touch swipe navigation in Slides Mode without hijacking vertical scroll in Original Mode.

Public Share URLs should default to a clean slide-first viewer. The MVP recipient viewer should show the main slide, minimal navigation, fullscreen, and slide count; it should not include a thumbnail/sidebar navigator or sidebar toggle. Thumbnail/sidebar navigation can return later for owner or presenter surfaces.

The default public viewer fit mode is contain-fit: show the entire slide inside the available viewport without cropping while preserving Deck Aspect Ratio.

Tada should preserve a deck's original aspect ratio when the Deck Engine can clearly detect one from deck metadata, known framework conventions, or stable slide geometry. If no reliable Deck Aspect Ratio is detected, default to 16:9. The recipient viewer should not normalize every deck to 16:9 because 4:3, square, portrait, and custom-format decks should not feel subtly distorted.

The MVP public viewer should not expose a recipient-facing fit-mode selector. Fit controls can return later for owner or presenter surfaces.

The viewer should load the deck's `index.html` from the bundle and rewrite relative asset resolution through the deck file route. It should not mutate stored HTML.

The cloud viewer should use the shared Deck Engine by default rather than blindly iframing the entire `index.html`. If Deck Engine extraction fails or produces no useful slides, the Viewer Shell should fall back to an original-HTML mode that displays the full entrypoint in a sandboxed iframe.

Original View should not be always-visible chrome in the happy path. Show it as a recovery affordance when Slides Mode has trouble, such as failed extraction, no useful slides, or detected runtime conflicts.

If a recipient switches to Original View, the viewer may remember that preference locally for that browser and Published Deck. This preference must not mutate the Published Deck or affect other viewers.

The Deck Bundle should preserve Stored Content faithfully. Slides Mode may adapt runtime behavior, such as neutralizing original deck navigation scripts that conflict with Tada controls, but those adaptations must not mutate stored files. Original Mode should render the full stored entrypoint more faithfully inside the same sandbox boundary.

Deck Content JavaScript should be allowed to run because many HTML decks depend on JavaScript for layout, animation, and navigation. JavaScript must run only inside a sandboxed Deck Content iframe served from the Content Origin, never inside the trusted `tada.fm` Viewer Shell. The Viewer Shell should grant the minimum sandbox permissions needed for deck compatibility and should not grant top-level navigation, automatic popups, privileged downloads, or Tada app credentials. If `allow-same-origin` is needed for deck compatibility, it is acceptable only because Deck Content is served from `content.tada.fm`, a separate origin from the trusted app.

Deck Runtime Warnings should be generated during upload from lightweight static detection that reuses the same deck-indicator and runtime-detection signals used by the Deck Engine where possible. Upload should not fully render the deck synchronously just to decide this warning.

If the Deck Engine extracts Speaker Notes, the public recipient viewer should not show them by default. Notes may be stored or available to future owner/presenter surfaces, but MVP Share URLs stay slide-focused.

## Security And Abuse Controls

Even without accounts, the MVP needs basic protections:

- Random unguessable IDs with enough entropy to prevent enumeration.
- `noindex` behavior for unlisted Share URLs.
- Upload size limit, initially 50 MB per deck.
- File count limit, initially 500 files per deck.
- Per-IP rate limits for anonymous uploads.
- Anonymous upload limits should be the same across web, raw API, CLI, and server-side MCP so the same deck behaves consistently across surfaces.
- Rate limiting should be generous for normal human and agent workflows, allowing several legitimate uploads in a row without friction, while throttling abuse patterns such as many uploads per minute or repeated large uploads.
- MIME and extension allowlist for common web assets.
- Web Asset Allowlist enforcement. Allow normal presentation web assets such as `.html`, `.htm`, `.css`, `.js`, `.mjs`, `.json`, `.txt`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.ico`, `.woff`, `.woff2`, `.ttf`, `.otf`, `.mp4`, `.webm`, `.mp3`, and `.wav`; reject executable, archive, installer, shell, or script-hosting file types such as `.exe`, `.dmg`, `.pkg`, `.zip`, `.tar`, `.gz`, `.sh`, `.bat`, and `.ps1`.
- Path normalization that rejects absolute paths and `..` traversal.
- URL Upload SSRF protections that reject private/internal/non-HTTP targets.
- HTML rendered in sandboxed iframes with Deck Content JavaScript allowed only inside the isolated Deck Content frame.
- No privileged cookies or credentials exposed to deck iframes.
- SVG files are allowed as Deck Content assets inside the Content Origin/sandbox boundary, but must never be inlined into or treated as trusted Viewer Shell UI.
- User-clicked external links inside Deck Content should open in a new browser tab, while internal same-deck anchors may remain inside the iframe. Automatic popups should be blocked.
- Optional server-side HTML scanning for obviously dangerous payloads later.
- Upload Certification copy in human UI and API/CLI documentation.
- Source Visibility Notice in upload-result UI, CLI, MCP, and API responses.

The system is public-unlisted, not private. Anyone with the link can view the deck.

## Error Handling

Upload errors should be concise and actionable:

- No HTML entrypoint found.
- Referenced asset is missing.
- Bundle exceeds size limit.
- Unsupported file type.
- Path escapes deck root.
- Upload failed or timed out.

Viewer errors should keep the share page usable and explain whether the issue is missing deck data, missing assets, malformed HTML, or a rendering failure.

Upload warnings should not be shown in the viewer just because they exist in the manifest. The viewer should surface missing assets only when they cause a visible rendering or load failure that the viewer can explain cleanly.

Public viewer errors should be written for recipients, not uploaders or developers. Avoid raw parser errors, storage errors, validation traces, or stack details in `/d/:id`; keep technical diagnostics in API responses, logs, or future owner surfaces.

## Testing

Automated tests should cover:

- HTML asset reference discovery.
- CSS `url(...)` asset discovery.
- `srcset` parsing.
- Prepared bundle validation and entrypoint detection.
- Path traversal rejection.
- Manifest generation.
- API create-deck response shape.
- Viewer asset URL resolution.
- Existing generated-deck detection in the viewer.

End-to-end tests should cover:

- Upload HTML file with local image and CSS assets.
- Upload prepared directory with `index.html`.
- Upload raw self-contained HTML through JSON API.
- Upload a public URL through JSON API and preserve remote asset resolution.
- Open returned share URL and verify rendered slide content.
- Verify final CLI output is script-readable.
- Verify upload returns before thumbnail completion and the viewer works without a thumbnail.

## Rollout Plan

1. Build the normalized bundle format, contracts, manifest generator, and uploader package.
2. Build the anonymous upload API and object storage persistence.
3. Build the hosted viewer route backed by stored bundles.
4. Build CLI packaging for HTML files, URL Upload, and prepared-directory upload.
5. Build the server-side MCP server with raw HTML, file-content, and URL upload tools.
6. Add the simple web paste/file/URL upload UI.
7. Add the lightweight internal Admin Console for read-only report review, recent deck records, and operational metrics.
8. Add minimal API documentation.
9. Add asynchronous Deck Thumbnail generation using Cloudflare Browser Run or an equivalent browser-rendering worker.
10. Add rate limits, limits reporting, and production deployment configuration.

## Future Milestones

After the MVP proves useful:

- OAuth and owned deck history.
- Delete and expiration controls.
- Private decks and organization sharing.
- OAuth authorization for server-side MCP and owned-deck management.
- Custom domains.
- Deck versioning.
- Public/user-facing analytics and view counts.
- Rich thumbnail management and regeneration controls.
- Password-protected links.
- API keys for automation.
- Terms, copyright/DMCA takedown process, repeat-infringer policy, and designated DMCA agent setup before broad public launch.
- Admin actioning for reports and decks, including hide/remove/resolve workflows.

## Success Criteria

The MVP is successful when a user or AI agent can upload a local HTML deck with assets, receive a URL in one command or tool call, send that URL to another person, and have the recipient view the deck without installing anything or signing in.
