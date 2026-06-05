# tada Electron HTML Presenter Design

## Goal

Build a macOS-first Electron desktop app that opens a local HTML file and presents it like a slide deck. The app is display-only: it does not save, export, mutate, or rewrite the source HTML.

## Product Shape

The app replaces the fragile localhost web workflow with a desktop shell. A user can open an HTML file from a native macOS file picker, drag and drop a file onto the window, or use macOS "Open With" later when packaging supports it. Once loaded, the app presents slides snappily with keyboard/clicker controls, fullscreen, and a side panel.

The first screen is the actual presenter, not a landing page. If no file is loaded, it shows a focused drop zone and an Open button.

## Desktop Architecture

Use a cleaner Electron architecture:

- Main process owns the BrowserWindow, app menu, file picker, fullscreen commands, and local-file reads.
- Preload exposes a narrow IPC API to the renderer, such as `openFile`, `readDroppedFile`, `toggleFullscreen`, and `onOpenFile`.
- Renderer owns parsing, deck detection, slide extraction, presentation state, keyboard controls, side panels, and iframe rendering.
- Shared pure helpers contain deck detection, source normalization, slide extraction decisions, and navigation key mapping so they can be tested without Electron.

The app should not depend on a localhost server for normal desktop use.

## Deck Detection

The presenter must inspect the loaded HTML and choose a rendering mode instead of blindly splitting by `section`.

### Existing Deck Mode

Use this mode when the HTML contains strong generated-deck indicators, including:

- `.deck`
- `.slide`
- `.slide.active`
- `[data-slide]`
- `.reveal .slides`
- `.remark-slide`
- `.swiper-slide`
- existing slide counters or dot navigation
- speaker notes such as `.notes`, `[data-notes]`, or notes panels
- document-level keyboard navigation scripts

In existing deck mode, the app treats the HTML as an already-authored deck. It extracts the real slide elements, preserves the original visual styling, and adapts the extracted slide so it is visible in our presenter. This specifically fixes the current failure mode where a generated deck's CSS hides every slide except `.slide.active`.

For each extracted slide:

- Preserve document `<head>` styles, fonts, and relative asset behavior.
- Remove or neutralize original navigation UI when it is outside the slide content.
- Do not run original deck navigation scripts inside the slide iframe.
- Ensure the extracted slide itself renders as visible by adding the active/current/visible state classes needed by common generated decks.
- Strip state assumptions that make non-first slides invisible when isolated.

### Generated Page Mode

Use this mode when the document looks like a long generated HTML page rather than a deck. Slide boundaries are inferred in this order:

1. explicit selector from the UI, defaulting to `section`
2. `article`
3. major heading groups beginning with `h1` or `h2`
4. whole document as one slide

### Fallback Mode

If no reliable boundaries are found, present the whole document as one slide and show the user that the app found one slide.

## Presentation UI

The central stage shows one slide at a time in an isolated iframe. The shell owns navigation and display controls.

Controls:

- Next and previous buttons
- PowerPoint-like keyboard/clicker controls:
  - next: right arrow, down arrow, PageDown, Space, Enter, N
  - previous: left arrow, up arrow, PageUp, Backspace, P
  - first/last: Home and End
- Fullscreen toggle
- Fit modes: 16:9, fill, and scroll
- Slide count

Fullscreen should feel native on macOS and keep navigation available through keyboard/clicker controls.

## Side Panel

The side panel supports both requested modes:

- Thumbnail mode: a vertical strip of slide previews for direct navigation.
- Presenter mode: current slide, next slide, notes, and elapsed time.

The first implementation should make thumbnail mode primary because it immediately helps navigation and makes split detection visible. Presenter mode can share the same slide extraction and notes metadata.

Notes behavior:

- Prefer `data-notes` on slide elements.
- Then detect common notes containers like `.notes` or `[data-notes]`.
- If no notes exist, the presenter notes area is empty rather than invented.

## Error Handling

The app should handle:

- non-HTML file selection
- empty files
- malformed HTML
- missing local assets
- documents that contain a single slide
- generated decks whose own scripts are incompatible with isolated rendering

Errors stay in the app shell and do not open devtools or expose raw stack traces to the presenter.

## Testing

Automated tests should cover:

- deck indicator detection
- existing deck mode for `.deck .slide` documents
- preservation of slide count for generated decks
- visibility normalization for `.slide.active`-style CSS
- notes extraction from `data-notes`
- generated page fallback splitting
- keyboard navigation mapping

Manual verification should include the previously failing `Ely-HII-Demo-Deck.html` case. It should load as ten slides, each slide should render its own content, and navigation should not be controlled by the original deck script.

## Non-Goals

- Editing slide content
- Saving modified HTML
- Exporting to PowerPoint or PDF
- Cloud sync
- Remote URL fetching for the first Electron version
- Cross-platform packaging before the macOS interaction feels right
