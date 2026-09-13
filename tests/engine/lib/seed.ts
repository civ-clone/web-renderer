import { instance as rngInstance } from '@civ-clone/core-random';

export type Config = {
  checkpoints: number[];
  height: number;
  players: number;
  seed: number;
  turns: number;
  width: number;
};

const supplied = JSON.parse(process.env.CONFORMANCE_CONFIG || '{}');

export const config: Config = {
  checkpoints: supplied.checkpoints ?? [1, 10, 50],
  height: supplied.height ?? 40,
  players: supplied.players ?? 4,
  seed: supplied.seed ?? 1,
  turns: supplied.turns ?? 50,
  width: supplied.width ?? 60,
};

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
