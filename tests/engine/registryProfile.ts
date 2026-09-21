// Which registries are iterated, how often, and how much they copy.
//
// `EntityRegistry.entries()` returns `this._entries.slice()` — a defensive
// copy — and `every`/`filter`/`forEach`/`map`/`some`/`length` all go through
// it, so every iteration of every registry copies the registry first. A CPU
// profile puts that around 9-12% of a headless run but attributes it to one
// frame, which does not say *whose* registry or *which* caller.
//
// This counts calls and copied elements per registry class, so the fix can go
// where the copying is rather than everywhere.
//
//   node tools/registry-profile.js --turns 30
//
// Same shape as `ruleProfile.ts`, including the `require` at the end: ES
// imports are hoisted, and the engine must not boot before the patch is in.

import './lib/seed';

import { EntityRegistry } from '@civ-clone/core-registry/EntityRegistry';

type Count = { calls: number; copied: number };

const counts = new Map<string, Count>();
const entries = EntityRegistry.prototype.entries;

EntityRegistry.prototype.entries = function <T>(this: EntityRegistry<T>): T[] {
  const name = this.constructor.name,
    count = counts.get(name) ?? { calls: 0, copied: 0 },
    result = entries.call(this) as T[];

  count.calls += 1;
  count.copied += result.length;
  counts.set(name, count);

  return result;
};

const report = (): void => {
  const rows = [...counts.entries()].sort((a, b) => b[1].copied - a[1].copied);
  const totalCopied = rows.reduce((sum, [, count]) => sum + count.copied, 0);
  const totalCalls = rows.reduce((sum, [, count]) => sum + count.calls, 0);

  process.stderr.write(
    `\nregistry iteration over the run — ${totalCalls.toLocaleString()} ` +
      `entries() calls copying ${totalCopied.toLocaleString()} element(s)\n\n` +
      `${'registry'.padEnd(30)}${'share'.padStart(7)}${'copied'.padStart(
        16
      )}${'calls'.padStart(14)}${'per call'.padStart(10)}\n`
  );

  rows
    .slice(0, 20)
    .forEach(([name, { calls, copied }]) =>
      process.stderr.write(
        `${name.padEnd(30)}${((copied / totalCopied) * 100)
          .toFixed(1)
          .padStart(6)}%${copied.toLocaleString().padStart(16)}${calls
          .toLocaleString()
          .padStart(14)}${(copied / calls).toFixed(1).padStart(10)}\n`
      )
    );
};

const exit = process.exit.bind(process);

process.exit = ((code?: number): never => {
  report();

  return exit(code);
}) as typeof process.exit;

require('./run');
