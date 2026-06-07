# TaDa! Universal Presentation Runtime Design

## Goal

Turn TaDa! from an HTML-only presentation shell into a universal local presentation runtime. A user should be able to give TaDa! an HTML file, URL, PowerPoint file, Google Slides link, or ordinary website and quickly present it as a clean deck without saving or editing the source artifact.

The product promise is: open anything presentation-shaped, press Present, and show it to a client without browser chrome, broken formatting, or manual setup.

## Product Decisions

This design makes these calls so implementation can move without another requirements pass:

- TaDa! stays display-first. It may export standalone TaDa! shows for existing HTML behavior, but new PowerPoint, Google Slides, and website deck ingestion runs in memory by default.
- HTML remains the native source type and keeps the current high-fidelity runtime-preserving behavior.
- PowerPoint files become image-backed TaDa! slides for the first production version. This prioritizes fidelity, speed, and predictable presentation over editable HTML conversion.
- Google Slides links use official Google present mode when the deck cannot be exported, and an image-backed TaDa! deck when the link is public or exportable.
- Website-to-deck uses in-memory section capture. TaDa! does not save screenshots unless the user explicitly exports a future show.
- Presenter mode becomes a real two-window presentation flow, not a CSS-only simulation inside the main app window.

## Architecture

Add a deck session layer between source ingestion and rendering. Every input type produces the same internal `DeckSession` shape:

- `id`: stable in-memory session id
- `title`: source label shown in the toolbar
- `sourceType`: `html`, `powerpoint`, `google-slides`, or `website`
- `renderMode`: `html-runtime`, `html-static`, `image`, `remote-present`, or `website-capture`
- `slides`: ordered list of slides
- `currentIndex`: current slide
- `notes`: optional per-slide speaker notes
- `sourceUrl` / `filePath`: metadata for labels and relative assets
- `createdAt`: used for timers and cache eviction

Renderer code should only navigate a `DeckSession`. Source-specific logic lives in adapters:

- `html-adapter`: wraps current `extractSlides` behavior.
- `powerpoint-adapter`: converts a local `.pptx` or `.ppt` into in-memory slide images.
- `google-slides-adapter`: detects Google Slides links and chooses export or official-present mode.
- `website-adapter`: renders a website in a hidden Electron page, detects sections, captures them, and returns image slides.
- `presenter-service`: owns the audience window and syncs session/index changes between windows.

This keeps source handling out of the visual shell and prevents future formats from becoming special cases scattered through `app.js`.

## PowerPoint Support

### File Types

TaDa! should accept:

- `.pptx`
- `.ppt`

The native file picker, drag-and-drop, command-line open handling, and file associations should include these extensions. Unsupported Office-adjacent files, such as `.key`, should produce a clear message instead of attempting a bad conversion.

### Conversion Strategy

PowerPoint rendering should be image-backed for the first production implementation.

Implementation path:

1. Main process receives the file path.
2. PowerPoint adapter creates an app-owned temporary working directory under the OS temp folder.
3. Adapter tries to convert slides to PNGs.
4. Each PNG becomes a TaDa! image slide with the original 16:9 or 4:3 aspect ratio.
5. Temporary files are deleted when the session closes or the app quits.

Converter order:

1. Bundled converter, when available in a packaged build.
2. Local LibreOffice or `soffice`, if installed.
3. Clear failure state with installation guidance and a fallback option to open the PowerPoint externally.

The first implementation can support `.pptx` before `.ppt` if the converter path makes legacy `.ppt` less reliable, but the UI should list both and report conversion failures honestly.

### Notes

Speaker notes from PowerPoint are optional in the first build. If a conversion path exposes notes reliably, include them; otherwise the presenter panel shows an empty notes state.

## Google Slides Support

### Detection

The source loader should recognize URLs containing:

- `docs.google.com/presentation/d/<id>`
- `/presentation/u/*/d/<id>`
- `/present`
- `/edit`
- `/pub`

The adapter normalizes edit/share/present URLs into a known Google Slides source object.

### Rendering Modes

Use two modes:

1. **Exportable deck mode** for public or published decks. TaDa! requests slide images or a PPTX export, converts them into image slides, and presents them in the native TaDa! runtime.
2. **Official present mode** for private or non-exportable decks. TaDa! opens a dedicated audience window pointing at Google Slides present mode and keeps a presenter shell around it.

This avoids promising private Google account access before the app has an auth model. Private decks still work when the user's local browser/Electron session can access Google, but image extraction is only guaranteed for public/exportable links.

### Failure Handling

If a Google Slides link is blocked, private, or not exportable, the UI should offer:

- Open official present mode in TaDa!
- Open in external browser
- Copy a short explanation of how to publish or share the deck for native TaDa! conversion

## Website-To-Deck Support

### Product Behavior

When a user enters an ordinary website URL, TaDa! should turn the page into a deck in memory. The result should feel like “presentation mode for a website,” not a screenshot dumping tool.

The user flow:

1. User enters a website URL.
2. TaDa! loads the page in a hidden, sandboxed Electron browser context.
3. TaDa! waits for network idle or a bounded timeout.
4. A content script analyzes the page and identifies presentation-worthy sections.
5. TaDa! captures each section as a slide image.
6. The user presents the generated deck immediately.

### Section Algorithm

The website adapter should score candidate sections in this order:

1. Semantic containers: `main`, `section`, `article`, `header`, named landmarks.
2. Major heading groups beginning at `h1`, `h2`, or large visual headings.
3. Large content blocks with viewport-sized height, cards, screenshots, tables, pricing blocks, or hero areas.
4. Viewport chunks as fallback for long pages with no useful structure.

The script should ignore or reduce priority for:

- cookie banners
- sticky nav bars
- chat widgets
- hidden elements
- tiny decorative blocks
- repeated footer links
- ad-like sidebars

Each captured website slide should include a title inferred from the nearest heading or page title. Captures are kept in memory as data URLs or object URLs and discarded with the session.

### Interaction

Website slides are snapshots in the first version. This is intentional: snapshots are fast, reliable in fullscreen, and avoid cross-origin interaction problems. A future “live website slide” mode can be added after the capture deck works well.

## Real Presenter Mode

The current presentation mode hides parts of the main window and toggles fullscreen. Replace it with a presenter service that can create two coordinated windows.

### Windows

Presenter console:

- The existing main TaDa! window.
- Shows thumbnails, current slide, next slide, notes, timer, source status, and navigation.
- Stays usable while presenting.

Audience window:

- Borderless or minimal-chrome Electron `BrowserWindow`.
- Renders only the active slide or official remote present page.
- Can go fullscreen on the selected display.
- Receives navigation updates from the presenter console.
- Closes or exits fullscreen when the user presses Escape.

### Display Behavior

When the user clicks Present:

1. If more than one display exists, open the audience window on the non-primary display and fullscreen it.
2. If only one display exists, open the audience window fullscreen on the same display and keep a quick Escape path back to the console.
3. If the audience window is closed, return the main app to normal side-panel view.

The first implementation can avoid a custom display-picker dialog. It should choose the external display automatically, then expose a simple future hook for manual display selection.

### Navigation Sync

Navigation events flow through one session controller:

- Presenter console button click
- Keyboard shortcut
- Audience window click zone
- Escape
- Future remote/clicker support

Every event updates `DeckSession.currentIndex`, then broadcasts the new index to both windows. This prevents the presenter panel and audience view from drifting out of sync.

### Presenter Panel

The presenter side panel should be upgraded from passive metadata to an actual console:

- Large current slide preview
- Next slide preview
- Notes
- Elapsed timer
- Current clock
- Slide count and progress
- Thumbnail rail
- End presentation button

This panel is part of the main app; it does not appear in the audience window.

## Security

TaDa! will handle arbitrary local files and remote websites, so adapters must keep strict boundaries:

- Keep Node disabled in renderer windows.
- Use preload APIs for all privileged operations.
- Do not enable arbitrary webviews.
- Load websites in isolated hidden windows with explicit navigation limits.
- Block permission requests by default.
- Do not persist website capture output unless the user explicitly exports.
- Do not expose local file paths to remote pages.
- Keep temporary PowerPoint conversion files under an app-owned temp folder and delete them.

Google official-present windows may need broader navigation allowances for `docs.google.com` and related Google auth domains. Those allowances should be scoped to that audience window, not the main app shell.

## UI Changes

The source bar should accept all supported inputs with one mental model:

- HTML file
- PowerPoint file
- Google Slides link
- Website URL
- localhost URL
- pasted raw HTML

Empty state copy should mention the broader capability without becoming wordy:

- Primary action: Open file
- Secondary action: Paste URL
- Tertiary action: Copy AI deck prompt
- Accepted chips: HTML, PowerPoint, Google Slides, websites

Toolbar buttons should remain icon-led. Add source-type status after load, such as `HTML deck`, `PowerPoint`, `Google Slides`, or `Website capture`.

When conversion is in progress, the stage should show an honest progress state:

- Loading source
- Rendering slides
- Capturing sections
- Preparing presenter

## Error Handling

Errors should be specific and recoverable:

- PowerPoint converter missing: explain that TaDa! cannot render PowerPoint on this machine yet and offer external open.
- PowerPoint conversion failed: show the file name and keep the app responsive.
- Google Slides private/export blocked: offer official present mode.
- Website load timed out: offer retry and snapshot-current-page fallback.
- Website capture found no sections: fallback to viewport chunks.
- Audience window failed to open: fall back to current-window fullscreen.

No source path should end with a blank stage or spinner that never resolves.

## Testing

Automated coverage should include:

- Source classifier for HTML, PowerPoint, Google Slides, website, localhost, local path, and pasted HTML.
- File picker filters and file association config for HTML and PowerPoint.
- Deck session model creation for each source type.
- Presenter service window lifecycle with mocked Electron windows.
- Navigation sync between presenter and audience windows.
- Escape behavior from audience back to console.
- Website section scoring with fixture pages.
- Website fallback chunking when no semantic sections exist.
- Google Slides URL normalization and mode selection.
- PowerPoint adapter failure path when no converter exists.
- Temporary file cleanup.

Electron smoke coverage should include:

- Open HTML deck and present in audience window.
- Open a synthetic image-backed deck and navigate it.
- Load a local fixture website URL and generate multiple snapshot slides.
- Verify presenter console and audience slide index remain synchronized.
- Verify presenting does not show toolbar/source bar in the audience window.

Manual QA should include:

- Ely demo HTML with animations and dot effects.
- The TaDa! product deck.
- A small `.pptx` deck.
- A public Google Slides URL.
- A private Google Slides URL.
- A client website with sections.
- A long unstructured web page.
- Single-display laptop use.
- External-display presentation use.

## Implementation Order

Implement in this order:

1. Deck session model and source classifier.
2. Real presenter service with audience window for existing HTML decks.
3. Image slide renderer and synthetic image-backed fixture deck.
4. PowerPoint adapter with converter detection and failure handling.
5. Google Slides adapter with URL normalization, official-present fallback, and public/exportable conversion where practical.
6. Website adapter with hidden-page section scoring and in-memory capture.
7. UI polish for source status, progress, and presenter console.
8. Regression and smoke tests across all source types.

This order makes presenter mode real first, then reuses that runtime for PowerPoint, Google Slides, and websites.

## Non-Goals

- Editing PowerPoint, Google Slides, HTML, or website content.
- Saving website-generated decks automatically.
- Full Google account integration in the first build.
- Pixel-perfect PowerPoint animation reproduction in the first build.
- Live interactive website slides in the first build.
- Keynote support.

## Success Criteria

The feature is ready when:

- HTML decks still preserve scripts, animations, and authored layout.
- Present mode creates an audience view with no toolbar, source bar, or side panel.
- Escape exits presentation cleanly.
- The presenter console stays in sync with the audience window.
- A PowerPoint file can be opened and presented as slides, or fails with a clear converter message.
- A Google Slides link opens in a useful present path, with native TaDa! conversion when exportable.
- A normal website URL becomes a multi-slide in-memory deck without saving output.
- Regression tests prove the app does not hang on failed conversion, blocked remote sources, or unstructured websites.
