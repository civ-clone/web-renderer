#!/usr/bin/env node

// The interface's form controls are drawn from the theme (#739): no stylesheet hides focus without saying what shows
// it instead (#364), the file input is never shown as the browser draws it, and every slider says how far it's filled.
// Read from the source, so a window no test opens is checked too.

const fs = require('fs');
const path = require('path');

const { webRenderer } = require('./lib/paths');

const failures = [];
let checks = 0;

const files = (directory, pattern) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);

    return entry.isDirectory()
      ? files(full, pattern)
      : pattern.test(full)
      ? [full]
      : [];
  });

// An outline taken away has a comment just above saying what shows focus, or a `:focus-visible` ring just after it.
files(path.join(webRenderer, 'src', 'css'), /\.scss$/).forEach((file) => {
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, index) => {
    if (!/^\s*outline:\s*(0|none)\s*;/.test(line)) {
      return;
    }

    checks++;

    const explained = /^\s*\/\//.test(lines[index - 1] ?? ''),
      replaced = lines
        .slice(index + 1, index + 6)
        .some((next) => next.includes(':focus-visible'));

    if (!explained && !replaced) {
      failures.push(
        `${path.relative(webRenderer, file)}:${
          index + 1
        } hides focus without a comment saying what shows it, or a :focus-visible ring after it`
      );
    }
  });
});

files(path.join(webRenderer, 'src', 'js', 'UI'), /\.ts$/).forEach((file) => {
  const name = path.relative(webRenderer, file),
    source = fs.readFileSync(file, 'utf8');

  // A file input in markup is hidden, with a button of the system to open it. (`savedGame`'s is made in code and
  //  never shown.)
  for (const [tag] of source.matchAll(/<input[^>]*type="file"[^>]*>/g)) {
    checks++;

    if (
      !/class="[^"]*visually-hidden/.test(tag) ||
      !/tabindex="-1"/.test(tag)
    ) {
      failures.push(
        `${name}: a file input is shown as the browser draws it: hide it and open it from a button: ${tag}`
      );
    }
  }

  // A slider sets `--fill`, which the theme's track is drawn from.
  if (/type="range"/.test(source)) {
    checks++;

    if (!source.includes("'--fill'")) {
      failures.push(`${name}: a slider that doesn't set --fill`);
    }
  }
});

if (failures.length) {
  process.stderr.write(
    `FAIL controls\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS controls (${checks} checks)`);
