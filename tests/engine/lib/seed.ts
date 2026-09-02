import { SeededRandom, install } from './rng';

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

// This module exists so the override lands before any `@civ-clone` module is
// evaluated. `import` declarations are hoisted, so doing it inline in `run.ts`
// would seed the generator only after every package had already been imported.
export const random: SeededRandom = install(config.seed);
