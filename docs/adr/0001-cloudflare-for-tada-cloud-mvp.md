# Use Cloudflare for the Tada Cloud MVP

Tada Cloud will use Cloudflare Workers for the upload API and viewer routes, R2 for Deck Bundle and Deck Thumbnail storage, D1 for Published Deck metadata, and Cloudflare Browser Run plus a background queue for asynchronous thumbnail generation in the MVP. This fits the product's need for fast public-unlisted deck viewing, object storage for HTML assets, a separate Content Origin, anonymous upload limits, and parallel screenshot enrichment without adding Vercel-style server upload body constraints or a heavier server stack.

The primary upload path will send a manifest plus normalized files from the CLI/MCP/web uploader rather than requiring server-side ZIP extraction in Workers.

**Considered Options**:
Cloudflare Workers + R2 + D1, Vercel + Vercel Blob, and a conventional Node service backed by S3-compatible storage.
