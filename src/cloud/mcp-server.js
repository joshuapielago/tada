import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";

import { DeckStoreError } from "./deck-store.js";
import { injectBaseElement, normalizeSourceUrl } from "../../public/deckify.js";

const deckOutputSchema = {
  id: z.string(),
  viewUrl: z.string(),
  createdAt: z.string(),
  title: z.string(),
  visibility: z.literal("unlisted"),
  manageable: z.boolean(),
  uploadSurface: z.string(),
  aspectRatio: z.object({ width: z.number(), height: z.number() }),
  thumbnailStatus: z.string(),
  thumbnailUrl: z.string(),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
  notices: z.array(z.object({ code: z.string(), message: z.string() })),
};

export async function handleMcpRequest(request, response, options) {
  if (request.method !== "POST") {
    response.writeHead(405, {
      "Content-Type": "application/json; charset=utf-8",
      Allow: "POST",
    });
    response.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      }),
    );
    return;
  }

  const body = await readJsonBody(request);
  const server = createTadaMcpServer(options);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  } finally {
    response.on("close", () => {
      transport.close();
      server.close();
    });
  }
}

function createTadaMcpServer({ deckStore, publicBaseUrl }) {
  const server = new McpServer({
    name: "tada-cloud",
    version: "0.1.0",
  });

  server.registerTool(
    "upload_html_deck",
    {
      title: "Upload HTML Deck",
      description: "Upload raw HTML as an unlisted Tada Published Deck and return a share URL.",
      inputSchema: {
        html: z.string(),
        title: z.string().optional(),
        certifyRights: z.boolean(),
      },
      outputSchema: deckOutputSchema,
    },
    async ({ html, title, certifyRights }) => {
      return toolSuccess(
        await deckStore.createDeck({
          html,
          title,
          certifyRights,
          uploadSurface: "mcp",
          sourceType: "html",
          publicBaseUrl,
        }),
      );
    },
  );

  server.registerTool(
    "upload_html_url",
    {
      title: "Upload HTML URL",
      description: "Upload a public HTML URL through Tada and return a share URL.",
      inputSchema: {
        sourceUrl: z.string(),
        title: z.string().optional(),
        certifyRights: z.boolean(),
      },
      outputSchema: deckOutputSchema,
    },
    async ({ sourceUrl, title, certifyRights }) => {
      const fetched = await fetchRemoteHtml(sourceUrl);
      return toolSuccess(
        await deckStore.createDeck({
          html: fetched.html,
          title,
          certifyRights,
          sourceUrl,
          finalUrl: fetched.finalUrl,
          sourceLabel: sourceLabelFromUrl(fetched.finalUrl),
          uploadSurface: "mcp",
          sourceType: "url",
          publicBaseUrl,
        }),
      );
    },
  );

  server.registerTool(
    "upload_html_file",
    {
      title: "Upload HTML File",
      description: "Upload MCP-provided HTML file content as an unlisted Tada Published Deck.",
      inputSchema: {
        filename: z.string(),
        content: z.string().optional(),
        contentBase64: z.string().optional(),
        title: z.string().optional(),
        certifyRights: z.boolean(),
      },
      outputSchema: deckOutputSchema,
    },
    async ({ filename, content, contentBase64, title, certifyRights }) => {
      const html = contentBase64 ? Buffer.from(contentBase64, "base64").toString("utf8") : content;
      if (!html) {
        throw new DeckStoreError(400, "missing-entrypoint", "Upload requires HTML file content.");
      }
      return toolSuccess(
        await deckStore.createDeck({
          html,
          title,
          certifyRights,
          sourceLabel: filename,
          uploadSurface: "mcp",
          sourceType: "html",
          publicBaseUrl,
        }),
      );
    },
  );

  return server;
}

function toolSuccess(deck) {
  return {
    content: [
      {
        type: "text",
        text: deck.viewUrl,
      },
    ],
    structuredContent: deck,
  };
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text.trim() ? JSON.parse(text) : undefined;
}

async function fetchRemoteHtml(rawSourceUrl) {
  const targetUrl = normalizeSourceUrl(rawSourceUrl);
  const url = new URL(targetUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DeckStoreError(400, "invalid-source-url", "URL Upload requires a public HTTP or HTTPS URL.");
  }

  const response = await fetch(targetUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      "User-Agent": "tada-mcp/0.1",
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!response.ok) {
    throw new DeckStoreError(response.status, "source-fetch-failed", `URL returned ${response.status}.`);
  }
  if (!looksLikeHtml(contentType, text)) {
    throw new DeckStoreError(415, "source-not-html", "That URL did not return HTML.");
  }

  return {
    html: injectBaseElement(text, response.url || targetUrl),
    finalUrl: response.url || targetUrl,
  };
}

function looksLikeHtml(contentType, text) {
  return (
    /html|xml|text\/plain/i.test(contentType) ||
    /<!doctype\s+html|<html\b|<body\b|<section\b|<article\b|<h[12]\b/i.test(text)
  );
}

function sourceLabelFromUrl(value) {
  const url = new URL(value);
  return url.hostname || value;
}
