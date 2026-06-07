import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildViewportChunks,
  createWebsiteCapturePlan,
  isDistractingOverlay,
} from "../src/shared/website-sectioner.js";

describe("website sectioner", () => {
  it("prefers semantic sections with useful headings", () => {
    const plan = createWebsiteCapturePlan({
      pageTitle: "Client Site",
      viewport: { width: 1440, height: 900 },
      documentHeight: 1800,
      elements: [
        element("header", "Welcome to Ely", { y: 0, height: 780 }),
        element("section", "Pricing plans", { y: 820, height: 720 }),
      ],
    });

    assert.deepEqual(plan.map((slide) => ({ title: slide.title, reason: slide.reason })), [
      { title: "Welcome to Ely", reason: "semantic" },
      { title: "Pricing plans", reason: "semantic" },
    ]);
  });

  it("ignores cookie banners and sticky widgets while keeping real content", () => {
    const plan = createWebsiteCapturePlan({
      pageTitle: "Landing",
      viewport: { width: 1440, height: 900 },
      documentHeight: 1100,
      elements: [
        element("div", "Accept cookies", { y: 760, height: 120 }, { className: "cookie-banner", position: "fixed" }),
        element("div", "Chat with us", { y: 620, height: 240 }, { className: "chat-widget", position: "fixed" }),
        element("main", "AI concierge for hotels", { y: 0, height: 880 }),
      ],
    });

    assert.equal(isDistractingOverlay({ className: "cookie-banner", text: "Accept cookies", style: { position: "fixed" } }), true);
    assert.deepEqual(plan.map((slide) => slide.title), ["AI concierge for hotels"]);
  });

  it("uses large heading blocks when semantic containers are unavailable", () => {
    const plan = createWebsiteCapturePlan({
      pageTitle: "Report",
      viewport: { width: 1440, height: 900 },
      documentHeight: 1700,
      elements: [
        element("h1", "Quarterly report", { y: 80, height: 120 }),
        element("div", "KPI grid", { y: 230, height: 540 }),
        element("h2", "Next steps", { y: 940, height: 90 }),
      ],
    });

    assert.deepEqual(plan.map((slide) => slide.title), ["Quarterly report", "Next steps"]);
  });

  it("falls back to viewport chunks for unstructured pages", () => {
    const chunks = buildViewportChunks({
      pageTitle: "Long Page",
      viewport: { width: 1200, height: 800 },
      documentHeight: 2100,
    });

    assert.deepEqual(chunks.map((chunk) => ({ title: chunk.title, y: chunk.y, height: chunk.height })), [
      { title: "Long Page 1", y: 0, height: 800 },
      { title: "Long Page 2", y: 800, height: 800 },
      { title: "Long Page 3", y: 1600, height: 500 },
    ]);
  });
});

function element(tagName, text, rect, options = {}) {
  return {
    tagName,
    text,
    className: options.className ?? "",
    id: options.id ?? "",
    role: options.role ?? "",
    style: {
      display: options.display ?? "block",
      visibility: options.visibility ?? "visible",
      position: options.position ?? "static",
    },
    rect: {
      x: rect.x ?? 0,
      y: rect.y ?? 0,
      width: rect.width ?? 1200,
      height: rect.height,
    },
  };
}
