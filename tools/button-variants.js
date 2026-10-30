#!/usr/bin/env node

// Every button in the interface names its variant from the button system (#740), so a theme draws all of them: a
// `<button` in the interface's source carries a `btn-*` class, and buttons are made from markup or `lib/button.ts`,
// never `document.createElement('button')`, whose class this couldn't see. Read from the source rather than a rendered
// page, so a window no test opens is checked too. The debug panel is left out: players don't see it.

const fs = require('fs');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const ui = path.join(webRenderer, 'src', 'js', 'UI'),
  skipped = [path.join(ui, 'debug')],
  helper = path.join(ui, 'lib', 'button.ts'),
  variant =
    /\sclass="(?:[^"]*\s)?btn-(primary|secondary|quiet|danger|icon|bare|\$\{)/,
  failures = [];
let checks = 0;

const files = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);

    if (skipped.includes(full)) {
      return [];
    }

    return entry.isDirectory()
      ? files(full)
      : full.endsWith('.ts')
      ? [full]
      : [];
  });

files(ui).forEach((file) => {
  const source = fs.readFileSync(file, 'utf8'),
    name = path.relative(webRenderer, file),
    line = (index) => source.slice(0, index).split('\n').length;

  for (const match of source.matchAll(/<button\b[^>]*>/g)) {
    checks++;

    if (!variant.test(match[0])) {
      failures.push(
        `${name}:${line(match.index)} ${match[0]} has no btn-* variant class`
      );
    }
  }

  if (file !== helper) {
    for (const match of source.matchAll(/createElement\(\s*['"]button['"]/g)) {
      checks++;
      failures.push(
        `${name}:${line(
          match.index
        )} makes a button with createElement: use markup with a btn-* class or lib/button.ts`
      );
    }
  }
});

if (failures.length) {
  process.stderr.write(
    `FAIL buttonVariants\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS buttonVariants (${checks} buttons)`);
