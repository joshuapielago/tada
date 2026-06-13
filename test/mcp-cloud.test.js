import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { createPresentationServer } from "../server.js";

async function withCloudServer(testFn) {
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "tada-mcp-server-"));
  const server = await createPresentationServer({ storageRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    await testFn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(storageRoot, { force: true, recursive: true });
  }
}

async function withMcpClient(baseUrl, testFn) {
  const client = new Client({ name: "tada-test-client", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  await client.connect(transport);

  try {
    await testFn(client);
  } finally {
    await transport.close();
  }
}

describe("Tada Cloud MCP endpoint", () => {
  it("lists upload tools and uploads a raw HTML deck", async () => {
    await withCloudServer(async (baseUrl) => {
      await withMcpClient(baseUrl, async (client) => {
        const tools = await client.listTools();
        assert.deepEqual(
          tools.tools.map((tool) => tool.name).sort(),
          ["upload_html_deck", "upload_html_file", "upload_html_url"],
        );

        const result = await client.callTool({
          name: "upload_html_deck",
          arguments: {
            html: "<!doctype html><title>MCP Deck</title><section>From MCP</section>",
            certifyRights: true,
          },
        });

        assert.equal(result.isError, undefined);
        assert.equal(result.structuredContent.title, "MCP Deck");
        assert.match(result.structuredContent.viewUrl, new RegExp(`^${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/d/[a-z0-9]+$`));

        const viewerResponse = await fetch(result.structuredContent.viewUrl);
        assert.equal(viewerResponse.status, 200);

        const urlResult = await client.callTool({
          name: "upload_html_url",
          arguments: {
            sourceUrl: `${baseUrl}/test/fixtures/sample-deck.html`,
            certifyRights: true,
          },
        });
        assert.equal(urlResult.isError, undefined);
        assert.equal(urlResult.structuredContent.title, "Sample Client Deck");

        const fileResult = await client.callTool({
          name: "upload_html_file",
          arguments: {
            filename: "agent.html",
            content: "<!doctype html><title>Agent File</title><section>File bytes</section>",
            certifyRights: true,
          },
        });
        assert.equal(fileResult.isError, undefined);
        assert.equal(fileResult.structuredContent.title, "Agent File");
      });
    });
  });
});
