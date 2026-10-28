const fs = require('fs');
const path = require('path');

const { nodeModules, scope } = require('./paths');

const SKIP_DIRS = new Set(['node_modules', '.git', 'tests', 'test', '.dist']);

// Matches a `#name` declaration at the start of a line inside a class body.
// The trailing group tells a field (`: T`, `= v`, `;`, EOL) from a method (`(`).
const DECLARATION = /^([ \t]*)(static\s+)?(readonly\s+)?(#[A-Za-z_$][\w$]*)\s*(.?)/;

const walk = (dir, matches, found = []) => {
  let entries;

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return found;
  }

  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walk(fullPath, matches, found);
      }

      return;
    }

    if (matches(entry.name)) {
      found.push(fullPath);
    }
  });

  return found;
};

const sourceFiles = (dir) =>
  walk(dir, (name) => name.endsWith('.ts') && !name.endsWith('.d.ts'));

// JSON a package ships beside its sources, such as civ1-asset-extractor's
// `extract-data.json`, which the renderer imports directly. None of the
// checkouts restricts its pack list, so whatever is here is published too.
// `package.json` is synced on its own, and the rest are build configuration.
const NOT_DATA = /^(package(-lock)?\.json|tsconfig.*\.json)$/;

const dataFiles = (dir) =>
  walk(dir, (name) => name.endsWith('.json') && !NOT_DATA.test(name));

const scanSource = (dir) => {
  const result = {
    files: [],
    fields: 0,
    staticFields: 0,
    methods: 0,
    mathRandom: 0,
    registerRules: false,
  };

  sourceFiles(dir).forEach((fullPath) => {
    const source = fs.readFileSync(fullPath, 'utf8');
    const relative = path.relative(dir, fullPath);
    let fileFields = 0;

    if (relative === 'registerRules.ts') {
      result.registerRules = true;
    }

    result.mathRandom += (source.match(/Math\.random\s*\(/g) || []).length;

    source.split('\n').forEach((line) => {
      const match = DECLARATION.exec(line);

      if (!match) {
        return;
      }

      const [, , isStatic, , , next] = match;

      if (next === '(') {
        result.methods += 1;

        return;
      }

      if (isStatic) {
        result.staticFields += 1;

        return;
      }

      result.fields += 1;
      fileFields += 1;
    });

    if (fileFields > 0) {
      result.files.push(relative);
    }
  });

  return result;
};

const installedPackages = () => {
  const packages = {};

  fs.readdirSync(scope).forEach((name) => {
    const linkPath = path.join(scope, name);
    let realPath;

    try {
      realPath = fs.realpathSync(linkPath);
    } catch (e) {
      return;
    }

    let manifest;

    try {
      manifest = JSON.parse(
        fs.readFileSync(path.join(realPath, 'package.json'), 'utf8')
      );
    } catch (e) {
      return;
    }

    // `.pnpm/@civ-clone+core-city@0.1.10` vs the codeload URL form used for
    // dependencies declared as `github:civ-clone/<name>`.
    const store = path.relative(path.join(nodeModules, '.pnpm'), realPath);
    const resolution = /codeload\.github\.com/.test(store) ? 'github' : 'npm';

    packages[name] = {
      name,
      version: manifest.version,
      resolution,
      realPath,
      dependencies: Object.keys(manifest.dependencies || {})
        .filter((dependency) => dependency.startsWith('@civ-clone/'))
        .map((dependency) => dependency.slice('@civ-clone/'.length))
        .sort(),
      source: scanSource(realPath),
    };
  });

  return packages;
};

module.exports = { dataFiles, installedPackages, scanSource, sourceFiles };
