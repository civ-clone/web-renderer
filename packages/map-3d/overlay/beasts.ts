// The beasts specials stand for (docs/3d-renderer.md §5.2): horses, oxen, deer, elephants, foxes, seals and birds, each
//  made of plain shapes, as the built-in set's units are (`markers/figures.ts`), until a hosted set brings models (D3).
//  A little larger than life beside a unit's figures, which are drawn twice life size, so they're seen at play's zoom.
//
// Each is a list of parts about its feet, facing +z (forward), +y up and +x to its right, each part turned about its
//  own middle, first `roll` about its length's axis (z), then `pitch` about its side's (x): a positive pitch tips its
//  front (+z) down, or a part along y forward. The square's layer turns each beast about the vertical as it lays it.

/** What a special's beasts are. */
export type BeastKind =
  | 'horse'
  | 'ox'
  | 'deer'
  | 'elephant'
  | 'fox'
  | 'seal'
  | 'bird';

/** A part of a beast: its shape, which of its look's colours it takes, where its middle is, and its size and turn. */
export type BeastPart = {
  shape: 'box' | 'sphere' | 'cylinder' | 'cone';
  // Its coat, its detail (a mane, hooves, flippers, a bird's head) or the pale of its horns, tusks or tail's tip.
  colour: 'coat' | 'detail' | 'pale';
  at: readonly [number, number, number];
  size: readonly [number, number, number];
  pitch?: number;
  roll?: number;
};

// One part.
const part = (
  shape: BeastPart['shape'],
  colour: BeastPart['colour'],
  at: readonly [number, number, number],
  size: readonly [number, number, number],
  pitch = 0,
  roll = 0
): BeastPart => ({
  shape,
  colour,
  at,
  size,
  ...(pitch === 0 ? {} : { pitch }),
  ...(roll === 0 ? {} : { roll }),
});

// The same part on its left and its right.
const pair = (
  shape: BeastPart['shape'],
  colour: BeastPart['colour'],
  [x, y, z]: readonly [number, number, number],
  size: readonly [number, number, number],
  pitch = 0,
  roll = 0
): BeastPart[] => [
  part(shape, colour, [-x, y, z], size, pitch, roll),
  part(shape, colour, [x, y, z], size, pitch, -roll),
];

// Four legs, standing on the ground, `apart` across and `along` from the middle, `height` tall, the bottom `hoof` of
//  each its detail.
const legs = (
  shape: BeastPart['shape'],
  apart: number,
  along: number,
  height: number,
  thick: number,
  hoof = 0
): BeastPart[] =>
  [along, -along].flatMap((z) => [
    ...pair(shape, 'coat', [apart, height / 2, z], [thick, height, thick]),
    ...(hoof === 0
      ? []
      : pair(
          'box',
          'detail',
          [apart, hoof / 2, z],
          [thick * 1.15, hoof, thick * 1.25]
        )),
  ]);

export const beastParts: {
  readonly [kind in BeastKind]: readonly BeastPart[];
} = {
  // Standing grazing-tall, its neck up and its head down a little, its mane, tail and hooves dark.
  horse: [
    part('sphere', 'coat', [0, 0.1, 0], [0.058, 0.062, 0.16]),
    ...legs('box', 0.017, 0.052, 0.08, 0.015, 0.012),
    part('box', 'coat', [0, 0.143, 0.085], [0.03, 0.032, 0.08], -0.93),
    part('box', 'detail', [0, 0.156, 0.076], [0.011, 0.014, 0.076], -0.93),
    part('box', 'coat', [0, 0.168, 0.132], [0.027, 0.03, 0.062], 0.55),
    part('box', 'detail', [0, 0.086, -0.094], [0.014, 0.014, 0.07], -0.93),
  ],
  // Heavy and low, a hump over its shoulders, its head low, its horns pale and out to its sides.
  ox: [
    part('sphere', 'coat', [0, 0.088, 0], [0.08, 0.075, 0.16]),
    part('sphere', 'coat', [0, 0.118, 0.04], [0.065, 0.06, 0.07]),
    ...legs('box', 0.024, 0.05, 0.06, 0.02, 0.01),
    part('box', 'detail', [0, 0.085, 0.1], [0.042, 0.045, 0.05], 0.35),
    ...pair('cone', 'pale', [0.03, 0.11, 0.098], [0.01, 0.04, 0.01], 0, 1.1),
    part('box', 'detail', [0, 0.08, -0.085], [0.01, 0.01, 0.05], -1.1),
  ],
  // Slender, its neck up, its antlers pale, its tail a pale tuft.
  deer: [
    part('sphere', 'coat', [0, 0.09, 0], [0.042, 0.048, 0.11]),
    ...legs('box', 0.012, 0.038, 0.072, 0.01, 0.008),
    part('box', 'coat', [0, 0.125, 0.058], [0.02, 0.022, 0.055], -1.1),
    part('box', 'coat', [0, 0.15, 0.078], [0.02, 0.022, 0.042], 0.45),
    ...pair('box', 'pale', [0.012, 0.18, 0.068], [0.005, 0.05, 0.005], 0, 0.45),
    ...pair(
      'box',
      'pale',
      [0.02, 0.19, 0.08],
      [0.004, 0.028, 0.004],
      -0.6,
      0.2
    ),
    part('sphere', 'pale', [0, 0.1, -0.058], [0.018, 0.018, 0.014]),
  ],
  // Big and grey, its legs thick, its ears out, its trunk hanging and its tusks pale.
  elephant: [
    part('sphere', 'coat', [0, 0.125, 0], [0.11, 0.1, 0.17]),
    ...legs('cylinder', 0.032, 0.052, 0.085, 0.036),
    part('sphere', 'coat', [0, 0.155, 0.095], [0.075, 0.075, 0.065]),
    ...pair(
      'box',
      'detail',
      [0.046, 0.155, 0.083],
      [0.01, 0.065, 0.05],
      0,
      0.2
    ),
    part('cylinder', 'coat', [0, 0.092, 0.132], [0.02, 0.095, 0.02], -0.3),
    ...pair('cone', 'pale', [0.022, 0.108, 0.135], [0.012, 0.065, 0.012], 1.05),
    part('box', 'detail', [0, 0.11, -0.09], [0.008, 0.008, 0.05], -1.2),
  ],
  // Small and low, its ears up, its snout pointed and its tail bushy, pale at its tip.
  fox: [
    part('sphere', 'coat', [0, 0.05, 0], [0.03, 0.032, 0.08]),
    ...legs('box', 0.009, 0.027, 0.037, 0.008, 0.008),
    part('sphere', 'coat', [0, 0.068, 0.048], [0.032, 0.03, 0.036]),
    part(
      'cone',
      'detail',
      [0, 0.064, 0.074],
      [0.015, 0.032, 0.015],
      Math.PI / 2
    ),
    ...pair('cone', 'coat', [0.009, 0.088, 0.046], [0.011, 0.02, 0.011]),
    part('sphere', 'coat', [0, 0.046, -0.064], [0.024, 0.024, 0.075], -0.4),
    part('sphere', 'pale', [0, 0.031, -0.1], [0.017, 0.017, 0.026], -0.4),
  ],
  // Lying, its front raised, its head up, its flippers out at its sides and back.
  seal: [
    part('sphere', 'coat', [0, 0.026, 0], [0.065, 0.05, 0.16], -0.15),
    part('sphere', 'coat', [0, 0.058, 0.078], [0.042, 0.04, 0.048]),
    part('sphere', 'pale', [0, 0.052, 0.1], [0.022, 0.02, 0.026]),
    ...pair(
      'box',
      'detail',
      [0.036, 0.012, 0.036],
      [0.048, 0.007, 0.022],
      0,
      0.3
    ),
    ...pair(
      'box',
      'detail',
      [0.014, 0.012, -0.09],
      [0.02, 0.006, 0.045],
      0,
      0.15
    ),
  ],
  // Round, its head and neck its detail, its tail long and up a little behind it.
  bird: [
    part('sphere', 'coat', [0, 0.036, 0], [0.038, 0.036, 0.058]),
    part('sphere', 'detail', [0, 0.058, 0.03], [0.022, 0.026, 0.024]),
    part('cone', 'pale', [0, 0.057, 0.046], [0.007, 0.014, 0.007], Math.PI / 2),
    part('box', 'coat', [0, 0.046, -0.062], [0.01, 0.005, 0.085], 0.35),
    ...pair('box', 'detail', [0.008, 0.009, 0.004], [0.004, 0.018, 0.004]),
  ],
};

/** How far a beast reaches from its middle, across (to either side) and along (forward or back), about its parts. */
export const beastReach = (
  kind: BeastKind
): { across: number; along: number } =>
  beastParts[kind].reduce(
    (reach, { at, size }) => ({
      across: Math.max(reach.across, Math.abs(at[0]) + size[0] / 2),
      along: Math.max(reach.along, Math.abs(at[2]) + size[2] / 2),
    }),
    { across: 0, along: 0 }
  );

export default beastParts;
