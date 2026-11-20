// A puff of smoke where a unit falls in battle on the 3D map (docs/3d-renderer.md §6.4, plan 2.4): a handful of grey
//  blobs bursting from where it fell, spreading and rising, swelling at once and then shrinking away to nothing as the
//  loser fades. Solid shapes, made by code as the figures are, rather than see-through smoke: drawn with the land and
//  the units, so neither the sea nor the cloud needs drawing in another order round it.

/** One of a puff's blobs: where it is, from the point it bursts from (`x` east, `y` up, `z` south), and how big. */
export type PuffBlob = {
  at: [number, number, number];
  size: number;
  // Which of the two greys it's drawn in: lighter (0) or darker (1).
  shade: 0 | 1;
};

/** How many blobs a puff is. */
export const PUFF_BLOBS = 7;

// How a blob swells and shrinks as the puff goes: from nothing at its start, at its biggest a quarter of the way
//  through, to nothing at its end.
const swell = (through: number): number => {
  const t = Math.min(1, Math.max(0, through)) ** 0.5;

  return 4 * t * (1 - t);
};

// Easing out: quick at first, slowing as it spreads.
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

// A share, 0 to 1, from a whole number: the same each time.
const share = (n: number): number => {
  const x = Math.sin(n * 12.9898) * 43758.5453;

  return x - Math.floor(x);
};

/**
 * A puff's blobs `through` its time, from 0 (the blow) to 1 (gone), laid by `seed` so no two look the same: one rising
 *  from the middle, the rest bursting out round it. Each at its biggest is about a third of a soldier's height.
 */
export const puffAt = (through: number, seed = 0): PuffBlob[] => {
  const t = Math.min(1, Math.max(0, through)),
    out = easeOut(t);

  return Array.from({ length: PUFF_BLOBS }, (_, index) => {
    if (index === 0) {
      return {
        at: [0, 0.08 + 0.22 * out, 0],
        size: 0.09 * swell(t),
        shade: 0,
      };
    }

    const angle =
        ((index - 1) / (PUFF_BLOBS - 1)) * Math.PI * 2 +
        (share(seed + index * 7) - 0.5) * 0.6,
      reach = (0.12 + share(seed + index * 13) * 0.08) * out,
      rise = 0.05 + (0.08 + share(seed + index * 17) * 0.1) * out;

    return {
      at: [Math.cos(angle) * reach, rise, Math.sin(angle) * reach],
      size: (0.055 + share(seed + index * 19) * 0.03) * swell(t * 1.1),
      shade: index % 2 === 0 ? 0 : 1,
    };
  });
};

export default puffAt;
