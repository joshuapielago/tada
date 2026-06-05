const USEFUL_HTML_PATTERNS = [
  /<!doctype\s+html/i,
  /<html(?:\s|>)/i,
  /<body(?:\s|>)/i,
  /<main(?:\s|>)/i,
  /<article(?:\s|>)/i,
  /<section(?:\s|>)/i,
  /<h[12](?:\s|>)/i,
  /\bclass=(["'])[^"']*\bslide\b[^"']*\1/i,
  /\bclass=(["'])[^"']*\bdeck\b[^"']*\1/i,
  /\bdata-slide(?:\s|=|>)/i,
  /<!--\s*slide\s*-->/i,
  /<hr\b/i,
];

export function isLikelyHtmlDocument(value) {
  const text = String(value ?? "").trim();
  if (!text || !/<[a-z!/][\s\S]*>/i.test(text)) {
    return false;
  }

  return USEFUL_HTML_PATTERNS.some((pattern) => pattern.test(text));
}

export function getPastedHtml(clipboardData) {
  if (!clipboardData || typeof clipboardData.getData !== "function") {
    return "";
  }

  for (const type of ["text/html", "text/plain"]) {
    const value = String(clipboardData.getData(type) ?? "").trim();
    if (isLikelyHtmlDocument(value)) {
      return value;
    }
  }

  return "";
}

export function buildClaudeDeckPrompt() {
  return [
    "Create a single-file HTML presentation deck for TaDa!.",
    "",
    "Requirements:",
    "- Output only one complete HTML file.",
    "- Use self-contained CSS in a <style> tag.",
    "- Use one <section class=\"slide\"> per slide.",
    "- Keep any scripts inline or same-file; animations and canvas effects are okay.",
    "- Do not require external build tools, React compilation, or separate assets.",
    "- Make the deck work at 16:9 presentation size.",
    "- Include speaker notes as data-notes attributes when useful.",
    "",
    "Return the HTML only, with no Markdown fence.",
  ].join("\n");
}
