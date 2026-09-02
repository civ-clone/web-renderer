// Stage 2 of docs/engine-serialisation/05-engine-plan.md replaces this with an
// injected `Rng`. Until then the engine reaches `Math.random()` from nineteen
// packages, and a global override is the only way to make a run repeatable.
// It works precisely because there is one game per process here; two `Game`s
// would share the override and interleave their draws.

export interface SeededRandom {
  (): number;
  calls(): number;
  seed(): number;
}

export const createRandom = (seed: number): SeededRandom => {
  let state = seed >>> 0;
  let calls = 0;

  const random = (): number => {
    calls += 1;
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  random.calls = (): number => calls;
  random.seed = (): number => seed;

  return random;
};

export const install = (seed: number): SeededRandom => {
  const random = createRandom(seed);

  Math.random = random;

  return random;
};

export default install;
