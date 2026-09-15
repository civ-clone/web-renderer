const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { checkoutPath } = require('./paths');
const { binary, cleanMappedConfig, mappedConfig } = require('./publish');

// Build the committed `.js` / `.d.ts` / `.js.map` for a checkout changed
// outside a publish wave, so the commit holds output built from its own
// source.
//
// The same order the publish procedure uses — format the sources, compile,
// format again — because compiling first bakes pre-prettier positions into the
// source maps, which is how 23 of Stage 4's commits came to ship maps that
// described source nobody had committed. And the same mapped config, because a
// checkout's `.ts` imports need every dependency's *source*, including ones
// changed alongside it and not yet published.
//
// Unlike the publish gate this does not restore the tree afterwards: the point
// is to leave the output there to be committed. Sync a dependency first
// (`civ sync`) when a package is compiled against another one changed in the
// same batch — it resolves against the renderer's installed copy, not the
// neighbouring checkout.
const run = (args) => {
  const names = args.filter((arg) => !arg.startsWith('--'));

  if (names.length === 0) {
    console.log('civ compile <package...>');
    process.exitCode = 1;

    return;
  }

  names.forEach((name) => {
    const dir = checkoutPath(name);

    // `binary()` falls back to the renderer's own `prettier` and `tsc` when a
    // checkout has none installed. That is harmless in the publish gate, which
    // restores the tree afterwards, and wrong here, which does not: a package is
    // formatted by the version it pins, and borrowing another one rewrites files
    // nobody meant to touch. Refuse instead.
    //
    // Formatting drift found this way is real, and belongs in a commit of its
    // own. `civ1-player` pins prettier 2, but Stage 3's `registerRules`/events
    // commit was formatted with prettier 3 — trailing commas in 58 files that
    // the package's own `prettier:format` removes again.
    const missing = ['prettier', 'tsc'].filter(
      (bin) => !fs.existsSync(path.join(dir, 'node_modules', '.bin', bin))
    );

    if (missing.length > 0) {
      process.exitCode = 1;
      console.log(
        `  FAIL ${name}: no local ${missing.join(' or ')} — install the ` +
          'checkout first, so it is formatted with its own version'
      );

      return;
    }
    const tool = (bin, argv) =>
      execFileSync(binary(dir, bin), argv, {
        cwd: dir,
        encoding: 'utf8',
        stdio: 'pipe',
      });

    try {
      tool('prettier', ['--config', '.prettierrc', '**/*.ts', '--write']);
      tool('tsc', ['--build', mappedConfig(dir), '--force']);
      tool('prettier', ['--config', '.prettierrc', '**/*.ts', '--write']);
      console.log(`  ok   ${name}`);
    } catch (error) {
      process.exitCode = 1;
      console.log(
        `  FAIL ${name}\n${
          (error.stdout || '') + (error.stderr || '') || error.message
        }`
      );
    } finally {
      cleanMappedConfig(dir);
    }
  });
};

module.exports = { run };
