const assert = require("node:assert/strict");
const test = require("node:test");

const {
  findPowerPointConverter,
  isPowerPointFile,
  missingPowerPointConverterResult,
} = require("../src/shared/powerpoint-adapter.cjs");

test("recognizes supported PowerPoint file extensions", () => {
  assert.equal(isPowerPointFile("/tmp/demo.pptx"), true);
  assert.equal(isPowerPointFile("/tmp/demo.PPT"), true);
  assert.equal(isPowerPointFile("/tmp/demo.key"), false);
});

test("prefers TADA_SOFFICE_PATH when it is executable", async () => {
  const converter = await findPowerPointConverter({
    env: { TADA_SOFFICE_PATH: "/custom/soffice" },
    platform: "linux",
    access: async (candidate) => {
      assert.equal(candidate, "/custom/soffice");
    },
    which: async () => "",
    fileExists: async () => false,
  });

  assert.deepEqual(converter, {
    kind: "soffice",
    command: "/custom/soffice",
  });
});

test("detects Microsoft PowerPoint on macOS", async () => {
  const converter = await findPowerPointConverter({
    env: {},
    platform: "darwin",
    access: async () => {
      throw new Error("missing");
    },
    which: async () => "",
    fileExists: async (candidate) => candidate === "/Applications/Microsoft PowerPoint.app",
  });

  assert.deepEqual(converter, {
    kind: "mac-powerpoint",
    appPath: "/Applications/Microsoft PowerPoint.app",
  });
});

test("returns null when no converter is available", async () => {
  const converter = await findPowerPointConverter({
    env: {},
    platform: "linux",
    access: async () => {
      throw new Error("missing");
    },
    which: async () => "",
    fileExists: async () => false,
  });

  assert.equal(converter, null);
});

test("creates a structured missing converter result", () => {
  assert.deepEqual(missingPowerPointConverterResult("/tmp/demo.pptx"), {
    ok: false,
    code: "POWERPOINT_CONVERTER_MISSING",
    filePath: "/tmp/demo.pptx",
    canOpenExternal: true,
    message:
      "TaDa! could not find a local PowerPoint converter. Install LibreOffice, set TADA_SOFFICE_PATH, or open the file externally.",
  });
});
