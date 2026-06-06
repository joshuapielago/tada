const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { collectCommandLineOpenRequests } = require("../electron/command-line.cjs");

test("collects file paths after the app path in development launches", () => {
  const cwd = "/tmp/tada";
  const result = collectCommandLineOpenRequests(["/Applications/Electron", ".", "deck.html"], {
    appPath: cwd,
    cwd,
    isPackaged: false,
  });

  assert.deepEqual(result, [
    {
      filePath: path.resolve(cwd, "deck.html"),
      presentOnOpen: false,
    },
  ]);
});

test("collects the file association argument for packaged launches", () => {
  const cwd = "/tmp/tada";
  const filePath = "/tmp/tada/client-demo.html";
  const result = collectCommandLineOpenRequests(["/Applications/TaDa!.app/Contents/MacOS/TaDa!", filePath], {
    appPath: "/Applications/TaDa!.app/Contents/Resources/app.asar",
    cwd,
    isPackaged: true,
  });

  assert.deepEqual(result, [
    {
      filePath,
      presentOnOpen: false,
    },
  ]);
});

test("keeps present-on-open while filtering command flags", () => {
  const cwd = "/tmp/tada";
  const result = collectCommandLineOpenRequests(["/Applications/TaDa!", "--present", "deck.html"], {
    appPath: "/Applications/TaDa!.app/Contents/Resources/app.asar",
    cwd,
    isPackaged: true,
  });

  assert.deepEqual(result, [
    {
      filePath: path.resolve(cwd, "deck.html"),
      presentOnOpen: true,
    },
  ]);
});
