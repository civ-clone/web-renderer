import { instance as rngInstance } from '@civ-clone/core-random';

export type Config = {
  checkpoints: number[];
  // The difficulty level's class name (#173). Every player here is a computer player, so it sets their research
  //  rate, content citizens and costs.
  difficulty: string;
  height: number;
  players: number;
  seed: number;
  turns: number;
  width: number;
};

const supplied = JSON.parse(process.env.CONFORMANCE_CONFIG || '{}');

export const config: Config = {
  checkpoints: supplied.checkpoints ?? [1, 10, 50],
  difficulty: supplied.difficulty ?? 'King',
  height: supplied.height ?? 40,
  players: supplied.players ?? 4,
  seed: supplied.seed ?? 1,
  turns: supplied.turns ?? 50,
  width: supplied.width ?? 60,
};

// Who plays: civ.one's computer players, or players that end every turn without doing anything, to show that a rule
//  set's own rules can run a game on their own.
export type Clients = 'end-turn' | 'simple-ai';

// How `run.ts` plays, beyond the game itself (civ-clone/web-renderer#1008): `tools/soak.js` sets these. They are kept
//  out of `config` because `config` is part of the result document, which the conformance fixture compares whole.
export type Options = {
  clients: Clients;
  // Rule ids with any of these prefixes must not be registered once the set has loaded.
  forbidPrefixes: string[];
  // A topology id (core-world's `TopologyId`), or `null` for the engine's default, the square grid.
  grid: string | null;
  // Whether the result document carries a `run` report: how the game ended, how long it took, what went wrong. On
  //  whenever any option here is given, so that the default run's document is the fixture's.
  report: boolean;
  // A plugin set's id from `src/js/pluginSets.ts`, or `null` for its default.
  set: string | null;
  // Play until the game has a result, with `config.turns` as a limit, rather than to `config.turns`.
  untilGameOver: boolean;
};

const CLIENTS: Clients[] = ['end-turn', 'simple-ai'],
  OPTIONS = [
    'clients',
    'forbidPrefixes',
    'grid',
    'report',
    'set',
    'untilGameOver',
  ];

export const options: Options = {
  clients: supplied.clients ?? 'simple-ai',
  forbidPrefixes: supplied.forbidPrefixes ?? [],
  grid: supplied.grid ?? null,
  report: OPTIONS.some((option) => option in supplied),
  set: supplied.set ?? null,
  untilGameOver: supplied.untilGameOver === true,
};

if (!CLIENTS.includes(options.clients)) {
  throw new TypeError(
    `unknown clients '${options.clients}': expected one of ${CLIENTS.join(
      ', '
    )}`
  );
}

// This module exists so the seeding lands before any `@civ-clone` module is
// evaluated. `import` declarations are hoisted, so doing it inline in `run.ts`
// would seed the generator only after every package had already been imported.
//
// Before Stage 2 this overrode `Math.random` globally, which worked but could
// not survive Stage 3 — two `Game`s in one process would share the override.
// Now the engine draws from `core-random`'s instance and the run simply takes
// control of it.
rngInstance.restore(config.seed, 0);

export const random = rngInstance;

// Nothing in the engine should reach `Math.random` any more. Rather than assert
// that by grepping the source — which cannot see a dependency resolved at
// runtime — count the calls and put the number in the snapshot, where a
// non-zero value is a visible failure rather than silent nondeterminism.
//
// It still delegates to a seeded stream, so a stray call degrades the result
// instead of making the whole run irreproducible and hard to diagnose.
const stray = (() => {
  let calls = 0;
  const fallback = rngInstance;
  const original = Math.random;

  Math.random = (): number => {
    calls += 1;

    return fallback();
  };

  return {
    calls: (): number => calls,
    restore: (): void => {
      Math.random = original;
    },
  };
})();

export const mathRandomCalls = (): number => stray.calls();
