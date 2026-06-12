# Tada Source Deck Importers Design

## Goal

Add a source-deck import capability that turns PowerPoint files, Google Drive decks, PDFs, and other presentation-like sources into Tada-compatible HTML decks.

The output of every import is still a normal Tada Deck Bundle:

```text
manifest.json
index.html
assets/...
conversion-report.json
```

This keeps HTML as the canonical Tada artifact. Importing is a conversion step before presenting or uploading, not a replacement for the existing Deck Engine, Viewer Shell, Upload API, or normalized Deck Bundle contract.

## Product Shape

Users should be able to say, "turn this deck into a Tada deck," without caring whether the source is an `.html`, `.pptx`, Google Slides file, PDF, or Drive-hosted upload.

Primary flows:

- Desktop: open or drag a supported source file, preview the converted HTML deck, then optionally export or upload it.
- CLI: run `tada import ./client-deck.pptx --out ./client-deck-html` or `tada upload ./client-deck.pptx --convert`.
- MCP: call an import/upload tool with a local file path, raw HTML, or Drive file reference.
- Web/cloud: upload a supported source or choose a Google Drive file, then receive a Published Deck URL after conversion.

The user-facing promise is visual fidelity first. Text extraction, speaker notes, links, and metadata are preserved when reliable, but the first version should not promise a perfectly editable semantic reconstruction of every PowerPoint shape.

## Design Principles

- HTML remains canonical. Tada stores, presents, uploads, and shares HTML Deck Bundles.
- Importers are source adapters plus converters. They do not special-case the viewer.
- Fidelity beats editability for the first release. A reliable visual deck is more valuable than a fragile DOM recreation.
- Every import produces a conversion report with warnings. Warnings are shown to the importer, not to recipients in Presentation Mode.
- Cloudflare remains the right place for upload/view storage, but heavyweight document conversion should run in a separate conversion worker environment.
- Authenticated Drive import is an explicit integration. Private Google Drive URLs should not be scraped as public web pages.

## Approaches Considered

### Approach 1: Deep Semantic Reconstruction

Parse PowerPoint and Google Slides into real HTML elements for every shape, text box, chart, image, and animation.

Pros:

- Best future editability.
- Text is naturally selectable and searchable.
- Could eventually support richer responsive transformations.

Cons:

- High implementation complexity.
- PowerPoint layout fidelity is hard across fonts, effects, charts, masks, transitions, and embedded media.
- Easy to produce decks that look subtly wrong in client-facing moments.

This should be a later capability, not the first importer.

### Approach 2: Pure Slide Snapshots

Render each slide to an image and wrap each image in an HTML slide.

Pros:

- Fastest path to visual fidelity.
- Works across PPTX, PDF, and Google Slides export flows.
- Simple viewer compatibility.

Cons:

- Text is not selectable.
- Links, notes, accessibility, and search are lost unless separately reconstructed.
- Imported decks feel more like image galleries than HTML decks.

This is a useful fallback, but too lossy as the default product shape.

### Approach 3: Hybrid Visual-First Import

Render each slide as a high-fidelity visual background, then layer reliable metadata on top: speaker notes, extracted text, links, slide titles, source provenance, and accessibility labels where available.

Pros:

- Preserves the visual result users expect.
- Gives Tada useful deck metadata without overpromising full editability.
- Supports progressive enhancement: text overlays, link maps, chart extraction, and animation support can improve over time.

Cons:

- Requires a conversion report so users understand what was preserved and what was flattened.
- Needs a heavyweight converter for Office/PDF rendering.
- DOM output is initially presentational, not a clean editable source document.

Recommendation: use the hybrid visual-first importer.

## Source Support

### MVP Sources

- Existing HTML decks: pass through the current Deck Engine and upload path.
- Local `.pptx`: convert using the Office deck converter.
- Local `.pdf`: treat each page as one slide.
- Google Slides: use authenticated Google Drive export, then convert the exported artifact.
- Drive-hosted `.pptx` or `.pdf`: download via Drive API when authorized, then use the same local-file converters.

The Google Drive API treats native Google Slides as `application/vnd.google-apps.presentation`. Native Workspace files are exported with `files.export`; regular uploaded files are downloaded as files. The importer should prefer exporting Google Slides to PPTX for metadata extraction and PDF for visual rendering when both are available.

Drive export has a documented exported-content limit, so the MVP should fail oversized native Slides exports with a clear importer-facing error. A later Drive-specific snapshot fallback can use the Google Slides page thumbnail API slide-by-slide, but that path should be treated as snapshot-only because thumbnail URLs are temporary and quota-sensitive.

### Future Sources

- `.ppt` legacy PowerPoint.
- `.key` Keynote, when a dependable conversion path exists.
- Image folders, where each image becomes one slide.
- Canva, Figma, or other hosted decks through explicit integrations.
- Bulk Drive folder import.
- Semantic reconstruction for editable HTML output.

## Architecture

The new capability has four layers.

### 1. Source Descriptor

All importer entrypoints normalize input into a `SourceDescriptor`:

```json
{
  "kind": "local-file",
  "uri": "/Users/jp/Decks/client-deck.pptx",
  "mimeType": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "title": "Client Deck",
  "authRef": null
}
```

Supported descriptor kinds:

- `local-file`
- `drive-file`
- `public-url`
- `raw-html`
- `prepared-bundle`

### 2. Source Adapters

Adapters resolve a descriptor into an importable source artifact.

- `HtmlAdapter`: validates HTML and hands it to the existing Deck Engine.
- `LocalFileAdapter`: validates extension, MIME, size, and readable path.
- `DriveAdapter`: uses Google Drive metadata, exports native Slides, or downloads uploaded PPTX/PDF files.
- `UrlAdapter`: fetches public HTML directly, or downloads a public supported deck file when content type and size limits allow.

Private Drive links should route to `DriveAdapter` with auth. They should not be treated as anonymous URL Uploads.

### 3. Conversion Planner And Workers

The planner chooses a conversion strategy:

- `html-pass-through`
- `pptx-hybrid`
- `pdf-hybrid`
- `drive-export-then-convert`
- `prepared-bundle-pass-through`

Heavyweight conversion runs in an isolated worker process or service, not in the Cloudflare Worker upload path. The worker may use platform tools for rendering and PDF/image extraction, but those details stay behind the converter interface.

Converter responsibilities:

- Render slide visuals to stable assets such as PNG, JPEG, or SVG.
- Extract speaker notes when available.
- Extract slide titles and text where reliable.
- Preserve obvious hyperlinks when coordinates can be mapped safely.
- Flatten or warn about animations, transitions, embedded video/audio, macros, unsupported fonts, and external dependencies.
- Produce an importable HTML deck plus `conversion-report.json`.

### 4. HTML Deck Assembler

The assembler creates a Tada-compatible `index.html`:

```html
<main class="tada-imported-deck" data-source-kind="pptx">
  <section class="tada-import-slide" data-slide-index="0" data-notes="...">
    <img class="tada-import-slide-image" src="./assets/slides/slide-001.png" alt="Slide 1">
    <div class="tada-import-text-layer" aria-hidden="true">...</div>
    <a class="tada-import-link" href="..." style="..."></a>
  </section>
</main>
```

The existing Deck Engine should then detect the generated `section` elements and present the deck like any other HTML source.

## Manifest And Conversion Report

`manifest.json` remains the storage/viewer contract. It should include enough import metadata for troubleshooting without coupling the viewer to the source system:

```json
{
  "schemaVersion": 1,
  "title": "Client Deck",
  "entrypoint": "index.html",
  "source": {
    "kind": "pptx",
    "originalName": "client-deck.pptx",
    "sha256": "..."
  },
  "conversion": {
    "strategy": "pptx-hybrid",
    "convertedAt": "2026-06-13T00:00:00.000Z",
    "slideCount": 18,
    "warnings": ["2 slides contain animations that were flattened."]
  },
  "files": []
}
```

`conversion-report.json` is importer-facing and can be more detailed:

- source metadata
- converter version
- slide count
- warnings by slide
- unsupported features
- font substitutions
- failed external media
- elapsed conversion time

## API And Tooling

### Shared Function

The core library function should be shaped like:

```ts
importDeckSource(source: SourceDescriptor, options?: ImportOptions): Promise<ImportResult>
```

`ImportResult`:

```ts
{
  bundlePath?: string;
  bundle?: DeckBundle;
  title: string;
  slideCount: number;
  warnings: ImportWarning[];
  report: ConversionReport;
}
```

This function should be used by Desktop, CLI, MCP, and cloud import jobs.

### CLI

Add:

```bash
tada import <source> --out <folder> [--strategy hybrid|snapshot] [--json]
tada upload <source> --convert [--title "..."] [--json]
```

Existing HTML upload behavior should remain unchanged. Non-HTML upload without `--convert` may produce a helpful error that suggests the import command.

### MCP

Add tools after the local importer exists:

- `import_deck_source`: convert a source into a local HTML Deck Bundle.
- `upload_deck_source`: convert a source and upload the resulting bundle.

The MCP tools should return `viewUrl` when uploading and should always include warnings.

### HTTP API

For cloud conversion, add job-based endpoints:

```http
POST /api/imports
GET /api/imports/:id
POST /api/imports/:id/upload
```

`POST /api/imports` creates an import job from an uploaded source, Drive file reference, or public source URL. The job result is a normalized Deck Bundle. `POST /api/imports/:id/upload` publishes that bundle as a Published Deck.

The existing `POST /api/decks` upload API should continue to receive already-normalized bundles.

## Data Flow

### Local PPTX To Share URL

1. User runs `tada upload ./client-deck.pptx --convert`.
2. CLI creates a `local-file` descriptor.
3. Importer validates size, type, and path safety.
4. Converter renders slide visuals and extracts notes/text.
5. Assembler writes an HTML Deck Bundle.
6. Existing uploader packages the bundle and calls `POST /api/decks`.
7. User receives the Share URL.

### Google Slides To HTML Deck

1. User selects a Google Slides file.
2. Drive adapter reads file metadata and confirms it is a presentation.
3. Drive adapter exports the file to PPTX and, when useful, PDF.
4. Converter uses the exports to build a hybrid HTML deck.
5. User previews locally or uploads to Tada Cloud.

### PDF Deck To HTML Deck

1. Importer treats each PDF page as one slide.
2. Converter renders pages to images.
3. Optional text extraction builds a search/accessibility layer.
4. Assembler writes sections and assets.

## Error Handling

Blocking errors:

- unsupported source type
- source file missing
- auth required for private Drive file
- Drive export failed
- Drive export exceeded the provider export limit
- password-protected or encrypted source
- source exceeds size, page, or slide limits
- converter timed out
- no slides/pages found

Warnings:

- animations flattened
- transitions ignored
- font substituted
- embedded video/audio omitted or converted to poster image
- speaker notes unavailable
- hyperlinks could not be mapped
- external media not fetched
- slide contains unsupported objects

The viewer should not display conversion warnings during Presentation Mode. The importer, CLI, MCP response, and upload result page should show them.

## Security And Privacy

- Do not execute PowerPoint macros or embedded scripts.
- Run conversion in a sandboxed worker with CPU, memory, time, file count, and output size limits.
- Store temporary source files with a short TTL.
- Delete source artifacts after successful conversion unless the user explicitly asks to retain them.
- Keep Drive OAuth scopes as narrow as possible, ideally file-scoped or read-only.
- Treat imported decks as public-unlisted only after upload. Local import alone should not publish anything.
- Preserve the existing Viewer Shell and Content Origin isolation.

## Testing

Automated tests:

- source descriptor normalization
- MIME and extension classification
- Drive metadata classification with mocked API responses
- conversion strategy planning
- HTML deck assembly
- manifest and conversion report generation
- warning serialization
- path traversal and size-limit rejection

Golden fixtures:

- simple PPTX with text and images
- PPTX with notes
- PPTX with links
- PPTX with animations
- Google Slides export fixture
- PDF deck fixture
- existing HTML deck pass-through fixture

End-to-end tests:

- convert local PPTX to HTML bundle and open it in the Deck Engine
- convert PDF to HTML bundle and verify slide count
- upload converted bundle and open returned Share URL
- Drive import with mocked export/download responses
- oversized Google Slides export failure

Visual regression tests should compare rendered slide images against expected snapshots with a small tolerance. Text extraction should be tested structurally, not by pixel matching.

## Rollout Plan

1. Define `SourceDescriptor`, `ImportResult`, `ConversionReport`, and manifest conversion metadata.
2. Build HTML pass-through and PDF-to-image import first because they validate the importer pipeline with fewer Office-specific variables.
3. Add local PPTX hybrid conversion.
4. Add CLI `tada import` and `tada upload --convert`.
5. Add Desktop open/drag support for `.pptx` and `.pdf`.
6. Add authenticated Google Drive import for native Slides and Drive-hosted PPTX/PDF files.
7. Add cloud import jobs and connect them to the existing Published Deck upload path.
8. Add MCP tools over the same shared importer.

## Non-Goals

- Editing imported decks in Tada.
- Exporting imported HTML back to PowerPoint.
- Perfect animation or transition preservation.
- Treating private Google Drive URLs as public URL Uploads.
- Bulk folder import in the first version.
- Full semantic reconstruction of every PowerPoint shape in the first version.

## Success Criteria

The feature is successful when a user can import a local PPTX, a PDF deck, or an authenticated Google Slides file, receive a Tada-compatible HTML Deck Bundle, preview it through the existing Deck Engine, upload it through the existing upload path, and share a URL whose recipient sees a faithful slide deck without installing PowerPoint or signing into Google.

## References

- Google Drive API `files.export`: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export
- Google Drive export MIME types for Workspace documents: https://developers.google.com/workspace/drive/api/guides/ref-export-formats
- Google Slides API `presentations.pages.getThumbnail`: https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/getThumbnail
