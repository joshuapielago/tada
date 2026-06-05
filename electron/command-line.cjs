const path = require("node:path");

function collectCommandLineOpenRequests(argv, { appPath = "", isPackaged = false, cwd = process.cwd() } = {}) {
  const args = Array.isArray(argv) ? argv : [];
  const normalizedAppPath = appPath ? path.resolve(cwd, appPath) : "";
  const appPathIndex = normalizedAppPath
    ? args.findIndex((argument) => path.resolve(cwd, argument) === normalizedAppPath)
    : -1;
  const firstFileIndex = appPathIndex >= 0 ? appPathIndex + 1 : isPackaged ? 1 : 2;
  const presentOnOpen = args.includes("--present");

  return args
    .slice(firstFileIndex)
    .filter((argument) => argument && !String(argument).startsWith("-"))
    .map((argument) => ({
      filePath: path.resolve(cwd, argument),
      presentOnOpen,
    }));
}

module.exports = {
  collectCommandLineOpenRequests,
};
