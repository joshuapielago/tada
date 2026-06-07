const { execFile } = require("node:child_process");
const { access, mkdtemp, readdir, readFile, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const POWERPOINT_EXTENSIONS = new Set([".pptx", ".ppt"]);
const MAC_POWERPOINT_APP = "/Applications/Microsoft PowerPoint.app";

function isPowerPointFile(filePath) {
  return POWERPOINT_EXTENSIONS.has(path.extname(String(filePath ?? "")).toLowerCase());
}

async function findPowerPointConverter({
  env = process.env,
  platform = process.platform,
  access: accessFn = access,
  which = whichCommand,
  fileExists = defaultFileExists,
} = {}) {
  const envPath = String(env.TADA_SOFFICE_PATH ?? "").trim();
  if (envPath) {
    try {
      await accessFn(envPath);
      return {
        kind: "soffice",
        command: envPath,
      };
    } catch {
      // Fall through to auto-discovery.
    }
  }

  for (const binary of ["soffice", "libreoffice"]) {
    const command = await which(binary);
    if (command) {
      return {
        kind: "soffice",
        command,
      };
    }
  }

  if (platform === "darwin" && await fileExists(MAC_POWERPOINT_APP)) {
    return {
      kind: "mac-powerpoint",
      appPath: MAC_POWERPOINT_APP,
    };
  }

  return null;
}

function missingPowerPointConverterResult(filePath) {
  return {
    ok: false,
    code: "POWERPOINT_CONVERTER_MISSING",
    filePath,
    canOpenExternal: true,
    message:
      "TaDa! could not find a local PowerPoint converter. Install LibreOffice, set TADA_SOFFICE_PATH, or open the file externally.",
  };
}

async function convertPowerPointFile(filePath, options = {}) {
  if (!isPowerPointFile(filePath)) {
    return {
      ok: false,
      code: "POWERPOINT_UNSUPPORTED_FILE",
      filePath,
      canOpenExternal: true,
      message: "Choose a .pptx or .ppt file.",
    };
  }

  const converter = await findPowerPointConverter(options);
  if (!converter) {
    return missingPowerPointConverterResult(filePath);
  }

  if (converter.kind === "mac-powerpoint") {
    return convertWithMacPowerPoint(filePath, options);
  }

  return {
    ok: false,
    code: "POWERPOINT_CONVERTER_NOT_READY",
    filePath,
    canOpenExternal: true,
    message: "TaDa! found LibreOffice, but slide image conversion is not enabled for this build yet.",
  };
}

async function convertWithMacPowerPoint(filePath, { execFile: execFileFn = execFileAsync } = {}) {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "tada-powerpoint-"));

  try {
    const script = [
      'tell application "Microsoft PowerPoint"',
      "launch",
      `open POSIX file ${appleScriptString(filePath)}`,
      "set activePresentation to active presentation",
      `save activePresentation in POSIX file ${appleScriptString(workDir)} as save as PNG`,
      "close activePresentation saving no",
      "end tell",
    ].join("\n");

    await execFileFn("osascript", ["-e", script], { timeout: 60000 });
    const images = await collectPngFiles(workDir);
    if (images.length === 0) {
      return {
        ok: false,
        code: "POWERPOINT_CONVERSION_EMPTY",
        filePath,
        canOpenExternal: true,
        message: "PowerPoint opened the file, but TaDa! could not find exported slide images.",
      };
    }

    return {
      ok: true,
      sourceType: "powerpoint",
      sourceLabel: path.basename(filePath),
      filePath,
      slides: await Promise.all(images.map(async (imagePath, index) => ({
        src: `data:image/png;base64,${(await readFile(imagePath)).toString("base64")}`,
        title: `Slide ${index + 1}`,
      }))),
    };
  } catch (error) {
    return {
      ok: false,
      code: "POWERPOINT_CONVERSION_FAILED",
      filePath,
      canOpenExternal: true,
      message: error instanceof Error ? error.message : "PowerPoint conversion failed.",
    };
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
}

async function collectPngFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectPngFiles(entryPath));
    } else if (/\.png$/i.test(entry.name)) {
      results.push(entryPath);
    }
  }

  return results.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function defaultFileExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function whichCommand(binary) {
  try {
    const { stdout } = await execFileAsync("which", [binary], { timeout: 2500 });
    return stdout.trim().split(/\r?\n/)[0] ?? "";
  } catch {
    return "";
  }
}

function appleScriptString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

module.exports = {
  convertPowerPointFile,
  findPowerPointConverter,
  isPowerPointFile,
  missingPowerPointConverterResult,
};
