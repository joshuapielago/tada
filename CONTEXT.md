# Tada

Tada turns HTML slide decks into shareable presentations. This context defines the domain language for publishing and viewing decks.

## Language

**Published Deck**:
An immutable HTML slide deck that has been uploaded to Tada Cloud and can be viewed through a share URL. A Published Deck is the frozen shareable artifact, not the original local file or project folder, and it does not expire by default.
_Avoid_: Paste, upload, artifact, presentation

**Unlisted Deck**:
A Published Deck that can be viewed by anyone with its Share URL but should not be indexed or publicly discoverable. Published Decks are Unlisted Decks by default.
_Avoid_: Private deck, public deck, hidden deck

**Public Deck**:
A Published Deck that a Deck Owner has explicitly made indexable or publicly discoverable. Public Decks are a future visibility mode, not the MVP default.
_Avoid_: Anonymous deck, unlisted deck

**Upload**:
The user action that creates a shareable Published Deck by default. In Tada, uploading is not merely transferring files to storage; a successful Upload returns a URL that can be sent to someone else.
_Avoid_: File transfer, storage upload, draft upload

**Upload Success**:
The state where Tada has accepted an Upload, stored the Deck Bundle, written Published Deck metadata, and returned a Share URL. Upload Success does not require slide extraction, Deck Thumbnail generation, remote asset validation, or every viewer mode to have rendered successfully.
_Avoid_: Render success, thumbnail success, full validation

**Anonymous Upload**:
An Upload performed without an authenticated Deck Owner. Anonymous Uploads are publicly callable in the MVP, create Ownerless Decks, and share the same size, file-count, and rate limits across web, CLI, MCP, and raw API surfaces.
_Avoid_: Guest account, unauthenticated publish, anonymous ownership

**Server-Side MCP**:
The hosted MCP surface for agent-native Uploads to Tada Cloud. Server-Side MCP starts anonymous in the first usable version, follows the same limits and Upload Certification requirements as the public API, and does not imply Deck Owner management rights.
_Avoid_: Local MCP bridge, authenticated MCP, desktop filesystem access

**URL Upload**:
An Upload where Tada fetches a public HTML entrypoint from a user-provided URL and turns it into a Published Deck. URL Uploads fetch the entrypoint only in the MVP; linked remote assets remain remote dependencies.
_Avoid_: Web crawl, site import, remote asset snapshot

**Upload Warning**:
A typed, non-fatal issue found during Upload that may affect rendering but does not prevent creation of a Published Deck. Upload Warnings are shown to the uploader or calling agent, not inside the recipient's Viewer Shell or presentation mode; MVP warnings may report remote asset dependencies but do not validate whether those remote URLs are reachable.
_Avoid_: Upload error, failed upload, validation failure

**Upload Notice**:
A typed, expected product fact returned after Upload, such as source visibility or ownerless anonymous management limits. Upload Notices are shown to the uploader or calling agent but are not deck-specific rendering warnings.
_Avoid_: Upload warning, error, failure

**Source Visibility Notice**:
Uploader-facing notice that Deck Content is public-unlisted web content once uploaded. Tada does not offer a recipient-facing download button in the MVP, but recipients may still inspect or fetch HTML and asset files that are required to render the deck.
_Avoid_: Download warning, privacy guarantee, source protection

**Deck Runtime Warning**:
Uploader-facing notice that Deck Content appears to include its own navigation, presentation runtime, or script-driven slide behavior that may not work perfectly in Tada Slides Mode. Deck Runtime Warnings do not block Upload because Original Mode remains available as a fallback.
_Avoid_: Fatal parser error, broken deck, unsupported deck

**Upload Certification**:
The uploader's confirmation that they have the rights to share the deck and its assets, and that anyone with the link may view the resulting Published Deck. Upload Certification reduces product and abuse risk but is not a substitute for terms, takedown handling, or other legal process.
_Avoid_: Liability waiver, copyright shield, ownership proof

**Deck Bundle**:
The stored file set behind a Published Deck, containing an HTML entrypoint plus any assets required to render it. Raw HTML uploads and HTML-with-assets uploads are both normalized into Deck Bundles.
_Avoid_: Folder, zip, package, upload payload

**Stored Content**:
The original normalized files preserved inside a Deck Bundle. Stored Content should remain faithful to the Upload, while Viewer Shell modes may adapt runtime behavior during presentation.
_Avoid_: Rendered slide, modified deck, sanitized output

**Web Asset Allowlist**:
The set of file types Tada accepts inside a Deck Bundle. Tada allows normal web presentation files such as HTML, CSS, JavaScript, images, fonts, media, JSON, and text, but rejects executable archives or installer-like files because Tada is a deck viewer, not general file hosting.
_Avoid_: File hosting, arbitrary attachment support, executable upload

**Deck Title**:
The display name for a Published Deck. The uploader may provide a Deck Title; otherwise Tada derives it from the HTML `<title>`, then the source filename, then `Untitled Deck`.
_Avoid_: File name, page title, alias

**Deck Aspect Ratio**:
The preferred width-to-height frame for presenting a Published Deck. Tada preserves Deck Aspect Ratio when it is clear and defaults to 16:9 when it is unknown, so custom-format decks are not distorted while unknown decks remain predictable.
_Avoid_: Thumbnail ratio, viewport size, browser aspect ratio

**Deck Thumbnail**:
A generated PNG screenshot preview of the first slide content of a Published Deck, without Viewer Shell chrome. Deck Thumbnails use a 16:9 preview frame with the deck content contain-fit inside it rather than destructive cropping, are created asynchronously as best-effort enrichment, and are not required for Upload success or deck viewing.
_Avoid_: Required preview, cover image, blocking render

**Thumbnail URL**:
The stable `tada.fm` URL that serves a Published Deck's Deck Thumbnail for metadata, previews, and future dashboard surfaces. Thumbnail URLs proxy stored thumbnail files rather than exposing raw storage locations; ready thumbnails are immutable-cacheable, while pending or fallback responses are not.
_Avoid_: R2 URL, content URL, screenshot file path

**Thumbnail Status**:
The internal and API-visible state of Deck Thumbnail generation for a Published Deck. Thumbnail Status begins as `pending` after Upload Success and may become `ready` or `failed` without changing whether the Published Deck is viewable; it is not shown in the recipient Viewer Shell.
_Avoid_: Upload status, deck status, render status

**Deck Metadata**:
The API-visible descriptive state for a Published Deck, including title, visibility, manageability, warnings, Thumbnail Status, and thumbnail URL when available. Deck Metadata supports upload-result UIs, agent responses, polling, and future dashboards without becoming recipient viewer chrome.
_Avoid_: Manifest, deck content, viewer state

**Thumbnail Render Route**:
An internal route used by the thumbnail worker to render first-slide content for screenshot generation. The Thumbnail Render Route is not the public Viewer Shell and must not include viewer chrome, upload CTAs, analytics noise, or recipient controls.
_Avoid_: Public viewer screenshot, share page capture, browser preview route

**Share Alias**:
An editable human-facing URL owned by an identified user or workspace that points to a Published Deck and can later be moved to a different Published Deck. Share Aliases let users keep a memorable link while preserving immutable Published Deck versions.
_Avoid_: Custom URL, mutable deck, editable deck URL

**Deck Owner**:
An identified user or workspace with management rights over a Published Deck. Only a Deck Owner can delete a Published Deck or manage its Share Aliases.
_Avoid_: Anonymous uploader, link holder, viewer

**Ownerless Deck**:
A Published Deck created through anonymous Upload. An Ownerless Deck can be viewed by link but cannot be deleted, claimed, or managed in the MVP.
_Avoid_: Anonymous-owned deck, unclaimed deck, temporary deck

**Viewer Shell**:
The trusted Tada page that loads and presents a Published Deck while keeping deck content isolated from Tada app privileges. The Viewer Shell owns minimal navigation, minimal branding, and future authenticated user state, but it does not offer recipient-facing bundle downloads or a thumbnail sidebar in MVP public share pages.
_Avoid_: Deck page, presentation page, renderer

**Report Link**:
A low-emphasis recipient-facing path for reporting abuse, copyright concerns, or other policy issues with a Published Deck. The Report Link appears outside Presentation Mode and does not become marketing or upload chrome.
_Avoid_: Moderation dashboard, owner feedback, public comments

**Admin Console**:
An internal Tada surface for reviewing report records, recent deck records, and basic operational metrics during the private alpha. The Admin Console is for observing whether the product is functioning, not for moderation actioning in the MVP.
_Avoid_: User dashboard, public analytics, owner console

**Operational Metrics**:
Internal aggregate metrics about Tada Cloud health and usage, such as upload counts, upload failures, thumbnail failures, URL Upload failures, and report counts. Operational Metrics are not public deck analytics or recipient-facing view counts.
_Avoid_: Public analytics, viewer tracking, owner stats

**Contain Fit**:
The default slide fitting behavior for public viewing, where the entire slide is visible inside the available viewport without cropping while preserving Deck Aspect Ratio.
_Avoid_: Fill, crop, stretch

**Presentation Mode**:
The distraction-free viewing state where a Published Deck is being actively presented. Presentation Mode must remain deck-first and CTA-free, even when the normal Viewer Shell includes low-emphasis Tada branding or upload entry points.
_Avoid_: Fullscreen page, viewer page, marketing view

**Share URL**:
The canonical `tada.fm` URL returned after a successful Upload and intended for copying, pasting, and sending to recipients. Share URLs open a distraction-free Viewer Shell.
_Avoid_: Dashboard URL, shortener URL, content URL

**App URL**:
The `tada.fm` URL used for the product site, upload page, viewer routes, and future account surfaces.
_Avoid_: Short link, content URL

**Shortener URL**:
An optional short-domain URL that redirects to a canonical Share URL. Shortener URLs are distribution conveniences, not the canonical location of a Published Deck.
_Avoid_: Share URL, canonical URL, deck URL

**Deck Engine**:
The shared Tada behavior that detects deck structure, extracts slides, preserves deck runtime behavior, and maps presentation navigation. Desktop Tada and Tada Cloud should use the same Deck Engine even when their shells differ.
_Avoid_: Cloud renderer, desktop parser, slide splitter

**Slides Mode**:
The default Viewer Shell mode where the Deck Engine extracts and presents a Published Deck as navigable slides.
_Avoid_: Normal mode, parsed mode, deck mode

**Speaker Notes**:
Presenter-facing notes embedded in Deck Content and extracted by the Deck Engine when available. Speaker Notes are not shown to public recipients by default.
_Avoid_: Public notes, slide text, viewer notes

**Original Mode**:
The fallback Viewer Shell mode where the full original HTML entrypoint is displayed in a sandboxed iframe. Original Mode may run Deck Content scripts inside the sandbox, but those scripts never run in the Viewer Shell; its control should appear as a recovery affordance when Slides Mode has trouble, not as always-visible chrome.
_Avoid_: Raw mode, source mode, file mode

**Deck Content**:
The untrusted HTML, CSS, JavaScript, and media inside a Deck Bundle. Deck Content may execute its own scripts inside a sandboxed Content Origin frame, but it must remain isolated from the Viewer Shell even when the publisher is an authenticated user.
_Avoid_: Trusted deck, user HTML, iframe app

**Content Origin**:
The separate `content.tada.fm` web origin used to serve Deck Content files. The Content Origin is a different trust zone from the Viewer Shell origin so deck scripts cannot share Tada app cookies, authenticated state, or parent-page privileges; Deck Content files are immutable-cacheable because Published Decks are immutable.
_Avoid_: Same-origin deck files, app-hosted deck content
