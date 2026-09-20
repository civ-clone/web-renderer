// Which rule types the dispatch cost actually belongs to.
//
// A CPU profile says `Rule.validate` is ~50% of a headless run and
// `RuleRegistry.process` ~17%, but it cannot say *whose* rules those are: a
// criterion is an arrow function, so every frame below `validate` is
// `(anonymous)`. Issue #16 names `MovementCost` as the suspect on the strength
// of 121 registered rules; 121 registrations is not 121 evaluations, and Stage
// 7 already spent a week on a suspect the profile disagreed with.
//
// So this counts instead of guessing. It wraps `RuleRegistry.process` before
// the engine boots and records, per rule type: how many times `process` was
// called, how many rules that walked, and how many of those validated true.
// The ratio of the last two is the waste — rules evaluated to discover they do
// not apply.
//
//   node tools/rule-profile.js --turns 30
//
// Import order matters, and an `import` cannot express it: ES imports are
// hoisted, so `import './run'` at the bottom of the file would still evaluate
// the engine before the patch. `run` is therefore pulled in with a `require`
// at the end, which esbuild inlines where it is written. `./lib/seed` stays a
// real import so it keeps its "must evaluate first" guarantee.

import './lib/seed';

import { IConstructor } from '@civ-clone/core-registry/Registry';
import Rule from '@civ-clone/core-rule/Rule';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';

type Count = { calls: number; validated: number; matched: number };

const counts = new Map<string, Count>();
const process_ = RuleRegistry.prototype.process;

RuleRegistry.prototype.process = function <RuleType extends Rule>(
  this: RuleRegistry,
  ruleType: IConstructor<RuleType>,
  ...args: any[]
): any[] {
  const name = ruleType.name,
    count = counts.get(name) ?? { calls: 0, validated: 0, matched: 0 },
    rules = this.get(ruleType);

  count.calls += 1;
  count.validated += rules.length;

  const matched = rules.filter((rule: RuleType): boolean =>
    rule.validate(...(args as any))
  );

  count.matched += matched.length;
  counts.set(name, count);

  return matched.map((rule: RuleType): any => rule.process(...(args as any)));
};

const report = (): void => {
  const rows = [...counts.entries()].sort(
    (a, b) => b[1].validated - a[1].validated
  );
  const total = rows.reduce((sum, [, count]) => sum + count.validated, 0);

  process.stderr.write(
    `\nrule dispatch over the run — ${total.toLocaleString()} validations\n\n` +
      `${'rule type'.padEnd(28)}${'share'.padStart(7)}${'validations'.padStart(
        14
      )}${'process()'.padStart(12)}${'per call'.padStart(
        10
      )}${'matched'.padStart(10)}\n`
  );

  rows
    .slice(0, 20)
    .forEach(([name, { calls, validated, matched }]) =>
      process.stderr.write(
        `${name.padEnd(28)}${((validated / total) * 100)
          .toFixed(1)
          .padStart(6)}%${validated.toLocaleString().padStart(14)}${calls
          .toLocaleString()
          .padStart(12)}${(validated / calls).toFixed(1).padStart(10)}${(
          (matched / validated) *
          100
        )
          .toFixed(1)
          .padStart(9)}%\n`
      )
    );
};

const exit = process.exit.bind(process);

process.exit = ((code?: number): never => {
  report();

  return exit(code);
}) as typeof process.exit;

// Last, and a `require` rather than an `import`: patching has to happen before
// the engine starts, and a hoisted import would run it first.
require('./run');
