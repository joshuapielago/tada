const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");

const localScriptPattern = /<script\b(?<before>[^>]*?)\s+src\s*=\s*(?<quote>["'])(?<src>[^"']+)\k<quote>(?<after>[^>]*)>\s*<\/script>/gi;
const localScriptExtensions = new Set([".cjs", ".js", ".mjs"]);

async function inlineLocalScriptTags(html, sourceFilePath, readFile) {
  const source = String(html ?? "");
  const replacements = [];

  for (const match of source.matchAll(localScriptPattern)) {
    const scriptPath = resolveLocalScriptPath(match.groups?.src, sourceFilePath);
    if (!scriptPath) {
      continue;
    }

    let scriptSource;
    try {
      scriptSource = await readFile(scriptPath, "utf8");
    } catch {
      continue;
    }

    const attributes = `${match.groups?.before ?? ""}${match.groups?.after ?? ""}`
      .replace(/\s+\b(?:crossorigin|integrity|referrerpolicy|nonce)\b(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "")
      .trim();
    const escapedScriptSource = scriptSource.replace(/<\/script/gi, "<\\/script");
    replacements.push({
      from: match[0],
      to: `<script${attributes ? ` ${attributes}` : ""}>${escapedScriptSource}</script>`,
    });
  }

  return replacements.reduce((nextHtml, replacement) => nextHtml.replace(replacement.from, replacement.to), source);
}

function resolveLocalScriptPath(rawSrc, sourceFilePath) {
  const src = String(rawSrc ?? "").trim();
  if (!src || /^(?:https?|data|blob|javascript):/i.test(src)) {
    return null;
  }

  const sourcePath = path.resolve(String(sourceFilePath ?? ""));
  const sourceDirectory = path.dirname(sourcePath);
  let resolvedUrl;

  try {
    resolvedUrl = new URL(src, pathToFileURL(sourcePath).href);
  } catch {
    return null;
  }

  if (resolvedUrl.protocol !== "file:") {
    return null;
  }

  const resolvedPath = path.resolve(fileURLToPath(resolvedUrl));
  if (resolvedPath !== sourceDirectory && !resolvedPath.startsWith(`${sourceDirectory}${path.sep}`)) {
    return null;
  }

  if (!localScriptExtensions.has(path.extname(resolvedPath).toLowerCase())) {
    return null;
  }

  return resolvedPath;
}

module.exports = {
  inlineLocalScriptTags,
  resolveLocalScriptPath,
};
