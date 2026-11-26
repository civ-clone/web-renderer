// The square under the pointer on the 3D map (docs/3d-renderer.md §4.6, plan 3.5): a soft band of light inside its
//  outline, brightest at the edge and fading to nothing inward, laid on the land as it's drawn (`lay`), over what's
//  laid flat on it (fields, roads, railroads and runways) and on the sea's surface over the sea. Pure: the view says
//  which square, and the stage draws it.

import { GroundLayout } from './layouts';
import { Ground, RibbonMesh, lay } from './terrain/ribbons';

/**
 * How wide the band is, in from the outline; how far over the land it lies, over the highest of what's laid flat on it
 *  (a runway's markings, `LIFT.marking`); and how bright it is at the outline, from 0 to 1.
 */
export const HIGHLIGHT = { width: 0.09, lift: 0.03, edge: 0.55 } as const;

/** The band, as three.js takes it: its points, three numbers each; its triangles; and how bright it is at each point. */
export type HighlightMesh = {
  positions: Float32Array;
  indices: Uint32Array;
  brightness: Float32Array;
};

type Point = readonly [u: number, v: number];

// How far `point` is from the segment from `a` to `b`.
const offSegment = (
  [u, v]: Point,
  [au, av]: Point,
  [bu, bv]: Point
): number => {
  const du = bu - au,
    dv = bv - av,
    length = du * du + dv * dv,
    t =
      length === 0
        ? 0
        : Math.max(0, Math.min(1, ((u - au) * du + (v - av) * dv) / length));

  return Math.hypot(u - au - du * t, v - av - dv * t);
};

// Smoothly from 0 to 1 as `t` goes from 0 to 1.
const smooth = (t: number): number => {
  const clamped = Math.max(0, Math.min(1, t));

  return clamped * clamped * (3 - 2 * clamped);
};

/**
 * The band inside the outline of the square at (`x`, `y`), as `layout` lays it, on `ground`: a strip `HIGHLIGHT.width`
 *  wide along each side, its inner corners where the strips' inner edges meet, so it's as wide all round. Each point
 *  as bright as `HIGHLIGHT.edge` at the outline, less the further in, to none at the band's inner edge.
 */
export const highlightOf = (
  layout: GroundLayout,
  ground: Ground,
  x: number,
  y: number
): HighlightMesh => {
  const corners = layout.outline(x, y),
    [cu, cv] = layout.centre(x, y),
    { width, lift, edge } = HIGHLIGHT,
    // Each side's way in, a unit long: across it, towards the middle.
    inwards = corners.map(([au, av], at): Point => {
      const [bu, bv] = corners[(at + 1) % corners.length]!,
        length = Math.hypot(bu - au, bv - av) || 1,
        [nu, nv] = [-(bv - av) / length, (bu - au) / length],
        toward = nu * (cu - (au + bu) / 2) + nv * (cv - (av + bv) / 2);

      return toward >= 0 ? [nu, nv] : [-nu, -nv];
    }),
    // Each corner's inner corner, where the bands along its two sides meet: `width` in from each.
    inner = corners.map(([u, v], at): Point => {
      const [pu, pv] = inwards[(at + corners.length - 1) % corners.length]!,
        [nu, nv] = inwards[at]!,
        mitre = 1 + pu * nu + pv * nv;

      return [u + ((pu + nu) / mitre) * width, v + ((pv + nv) / mitre) * width];
    }),
    shapes = corners.map((corner, at) => {
      const next = (at + 1) % corners.length;

      return [corner, corners[next]!, inner[next]!, inner[at]!];
    }),
    into: RibbonMesh = { positions: [], indices: [], foam: [] };

  lay(into, shapes, ground, {
    lift,
    sea: lift,
    shade: (u, v) =>
      edge *
      (1 -
        smooth(
          Math.min(
            ...corners.map((corner, at) =>
              offSegment([u, v], corner, corners[(at + 1) % corners.length]!)
            )
          ) / width
        )),
  });

  return {
    positions: new Float32Array(into.positions),
    indices: new Uint32Array(into.indices),
    brightness: new Float32Array(into.foam),
  };
};

export default highlightOf;
