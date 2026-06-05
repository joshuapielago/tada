# tada Design

## Goal

Build a display-only localhost app that lets a user present an existing HTML file or URL to a client as a slide-like deck, without saving, exporting, or modifying the original artifact.

## Audience

The primary user is someone generating HTML artifacts with coding agents and needing to show them cleanly to a client. The client-facing experience should feel calm, focused, and intentional, with controls that disappear into the background.

## Core Flow

1. The user opens the localhost viewer.
2. The user provides an `.html` file, an `http://` / `https://` URL, a localhost shorthand URL, a bare remote hostname, a `file://` URL, or an absolute local path.
3. The app loads the HTML into memory for display only.
4. The app detects slide boundaries in this order:
   - Elements matching the chosen selector, defaulting to `section`.
   - Heading groups starting at `h1` or `h2` if no sections exist.
   - The full document as one slide if no useful boundaries are found.
5. The app shows one slide at a time in a presentation shell with keyboard navigation, fullscreen, and fit controls.

## Architecture

The app is a small dependency-free Node server plus a vanilla browser client. The server serves static assets and exposes a URL fetch endpoint so the browser can load most client-provided URLs without being blocked by CORS. Uploaded files are read directly in the browser with `FileReader`.

The client parses HTML using `DOMParser`, preserves the original document head, injects a `<base>` tag for URL-loaded documents, and renders each slide into a sandboxed iframe via `srcdoc`. Rendering each slide in its own iframe avoids the viewer CSS leaking into the presented HTML.

## Interface

The first screen is the tool itself, not a marketing page. It contains:

- A compact source bar for URL entry and file upload.
- A selector field with a default of `section`.
- A presentation stage that fills the viewport.
- Minimal controls for previous, next, fullscreen, fit mode, and slide count.
- PowerPoint-like navigation through bottom controls, side stage rails, and common keyboard/clicker keys: right/down/page-down/space/enter/N for next, left/up/page-up/backspace/P for previous, Home and End for first/last.

The visual tone is utilitarian and client-safe: neutral, restrained, and presentation-oriented.

## URL Behavior

The source endpoint handles `http://`, `https://`, `file://`, localhost shorthand, bare remote hostnames, and absolute local paths. If the server cannot fetch or read the source, or the response is not HTML-like, the client shows a clear error. For fetched URLs, relative links and assets resolve through an injected `<base href="...">`. For local files, relative assets are served through a localhost-only asset route rooted at the source file's directory.

## Error Handling

The app handles empty files, invalid URLs, failed fetches, missing slide selectors, and malformed HTML. In each case it keeps the source controls available and explains the problem in plain language.

## Testing

Automated tests cover source URL validation, fetched HTML preparation, selector defaults, and slide boundary inference helpers. Browser verification covers loading a sample HTML file, URL loading through the local fetch endpoint, keyboard navigation, fullscreen control availability, and responsive layout at desktop and narrow widths.
