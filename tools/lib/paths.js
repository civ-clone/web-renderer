const fs = require('fs');
const os = require('os');
const path = require('path');

const webRenderer = path.resolve(__dirname, '..', '..');
const nodeModules = path.join(webRenderer, 'node_modules');
const scope = path.join(nodeModules, '@civ-clone');
const toolsDir = path.join(webRenderer, 'tools');
const manifestPath = path.join(toolsDir, 'packages.json');

const expandHome = (pathName) =>
  pathName.startsWith('~/')
    ? path.join(os.homedir(), pathName.slice(2))
    : pathName;

// The workspace root is the parent of `web-renderer` unless the manifest says
// otherwise. Everything is resolved lazily so the tool still runs before
// `civ audit --write` has produced a manifest.
const workspaceRoot = () => {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    if (manifest.root) {
      return expandHome(manifest.root);
    }
  } catch (e) {}

  return path.dirname(webRenderer);
};

const checkoutPath = (name) => path.join(workspaceRoot(), name);

module.exports = {
  checkoutPath,
  expandHome,
  manifestPath,
  nodeModules,
  scope,
  toolsDir,
  webRenderer,
  workspaceRoot,
};
