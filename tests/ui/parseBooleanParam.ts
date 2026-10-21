// The `?debug=1`-style query-string switches: which spellings turn a switch on
// or off, and that anything else (or nothing) falls back to the default.

import parseBooleanParam from '../../src/js/UI/lib/parseBooleanParam';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that never reaches its checks must not pass by exiting 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL parseBooleanParam: the checks did not finish\n');
    process.exitCode = 1;
  }
});

const expect = (
  value: string | null,
  defaultValue: boolean,
  expected: boolean
) => {
  checks++;

  const actual = parseBooleanParam(value, defaultValue);

  if (actual !== expected) {
    failures.push(
      `${JSON.stringify(
        value
      )} with default ${defaultValue}: expected ${expected}, got ${actual}`
    );
  }
};

[true, false].forEach((defaultValue) => {
  ['1', 'true', 'yes', 'on', 'TRUE', 'Yes', ' on ', '\t1\n'].forEach((value) =>
    expect(value, defaultValue, true)
  );

  ['0', 'false', 'no', 'off', 'FALSE', 'No', ' off ', '\t0\n'].forEach(
    (value) => expect(value, defaultValue, false)
  );

  // Missing, empty, or not a recognised spelling: the default.
  [null, '', ' ', '2', '-1', 'y', 'n', 'enabled', 'truthy', '1 0'].forEach(
    (value) => expect(value, defaultValue, defaultValue)
  );
});

// As `Renderer.init` reads `?debug`.
const debugFrom = (search: string) =>
  parseBooleanParam(new URLSearchParams(search).get('debug'), false);

[
  ['', false],
  ['?debug', false],
  ['?debug=', false],
  ['?debug=1', true],
  ['?debug=true', true],
  ['?debug=0', false],
  ['?other=1', false],
].forEach(([search, expected]) => {
  checks++;

  if (debugFrom(search as string) !== expected) {
    failures.push(`${search}: expected debug ${expected}`);
  }
});

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL parseBooleanParam\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS parseBooleanParam (${checks} checks)`);
