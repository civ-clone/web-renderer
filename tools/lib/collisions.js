const fs = require('fs');
const path = require('path');

const { checkoutPath, scope } = require('./paths');
const { read } = require('./audit');
const { sourceFiles } = require('./scan');

// A derived class may declare `#x` alongside a base class's `#x` — they are
// separate slots and both are legal. Two `private _x` declarations in the same
// chain are not: TypeScript reports TS2415, "Types have separate declarations of
// a private property". The compiler only sees it once BOTH packages have
// converted, which for a cross-package chain means after the base has published.
// So find them by reading the source instead.
//
// Class names are matched by name, not by resolved import, which is a heuristic:
// two unrelated classes sharing a name could pair up. The output is small enough
// to check by hand, and a false positive costs a glance.
const CLASS = /^export\s+(?:abstract\s+)?class\s+(\w+)(?:<[^{]*?>)?\s*(?:extends\s+([\w]+)(?:<[^{]*?>)?)?/gm;
const FIELD = /^\s{2}(?:private\s+|protected\s+|readonly\s+)*(?:(#)|_)([A-Za-z_$][\w$]*)\s*[:=;?]/gm;

const classesIn = (dir, label, found) => {
  sourceFiles(dir).forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const declarations = [...source.matchAll(CLASS)];

    if (declarations.length === 0) {
      return;
    }

    const fields = [...source.matchAll(FIELD)].map(([, hash, name]) => ({
      name,
      converted: !hash,
    }));

    declarations.forEach(([, name, base]) => {
      // One class per file is the convention here; where a file holds more, the
      // fields cannot be attributed by regex, so they are shared and the result
      // is over- rather than under-inclusive.
      found.set(name, {
        base: base || null,
        fields,
        where: `${label}/${path.relative(dir, file)}`,
      });
    });
  });
};

const scan = () => {
  const manifest = read();
  const classes = new Map();

  // Installed packages first, so a checkout's newer source wins where both exist.
  fs.readdirSync(scope).forEach((name) => {
    try {
      classesIn(fs.realpathSync(path.join(scope, name)), name, classes);
    } catch (e) {}
  });

  Object.keys(manifest.packages).forEach((name) => {
    if (fs.existsSync(checkoutPath(name))) {
      classesIn(checkoutPath(name), name, classes);
    }
  });

  const found = [];

  classes.forEach((details, name) => {
    const seen = new Set([name]);
    let current = details.base;

    while (current && classes.has(current) && !seen.has(current)) {
      seen.add(current);

      const ancestor = classes.get(current);

      details.fields.forEach((field) =>
        ancestor.fields.forEach((inherited) => {
          if (inherited.name !== field.name) {
            return;
          }

          found.push({
            name,
            where: details.where,
            field: field.name,
            base: current,
            baseWhere: ancestor.where,
            live: field.converted && inherited.converted,
          });
        })
      );

      current = ancestor.base;
    }
  });

  return { classes: classes.size, found };
};

const run = () => {
  const { classes, found } = scan();

  console.log(`${classes} classes scanned`);

  if (found.length === 0) {
    console.log('no shadowed private fields');

    return;
  }

  found.forEach((hit) =>
    console.log(
      `  ${hit.live ? 'TS2415' : 'shadow'}  ${hit.where} ${hit.name}._${hit.field} over ${hit.baseWhere} ${hit.base}`
    )
  );

  const live = found.filter((hit) => hit.live);

  if (live.length > 0) {
    console.log(
      `\n${live.length} pair(s) already converted on both sides — these are compile errors.`
    );
    process.exitCode = 1;

    return;
  }

  console.log(
    `\n${found.length} pair(s) still shadowing via #private. Each must merge to one \`protected\` field, or rename, before both sides convert.`
  );
};

module.exports = { run, scan };
