// The grid's lines on the 3D map (docs/3d-renderer.md §4.6, plan 3.5), an option: a thin line along every square's
//  outline, on any grid. They're the land's own chunks drawn again (`Stage#showGrid`), lifted as the square under the
//  pointer's light is, over what's laid flat on the land, and onto the sea's surface over the sea, drawn with nothing
//  but the lines: at each point, how far it is from the nearest edge of the square it's on, from where it is on the
//  ground, as each grid lays its squares (`layouts/`). So there's nothing to build: shown or hidden, the stage draws
//  them or doesn't. Their numbers are the same here as in the shader (`gridGlsl`), so the tests can say where they lie.

import { Color, MeshBasicMaterial } from 'three';
import { TopologyId } from '@civ-clone/ui-protocol/topology';
import { HIGHLIGHT } from './highlight';

/** How the lines are drawn. */
export const GRID = {
  // How far a line reaches either side of an edge, in world units: a square's about 1 across.
  half: 0.012,
  // How far over the land, and over the sea's surface at sea, they lie: as high as the square under the pointer's light,
  //  over the highest of what's laid flat on the land, which is drawn over them.
  lift: HIGHLIGHT.lift,
  // How dark they are, from 0 to 1.
  opacity: 0.3,
  // Never less than this many of the screen's pixels either side of an edge: further off, they'd be thinner than a
  //  pixel and crawl as the camera moves, so they're as wide as this and fainter instead.
  leastPixels: 0.6,
  // Gone where a square's this few pixels across on the screen, faded from this many, as the lines would crowd it.
  goneAt: 6,
  fadedFrom: 14,
} as const;

// The staggered grid's diamonds are this far from their middles to their corners, across and down (`staggeredIso.ts`).
const HALF = Math.SQRT2 / 2;
// The hex grid's hexes are this far from their middles to their top and bottom corners, and their rows this far apart
//  (`hexOddR.ts`); their sides are half a square from their middles.
const SIZE = 1 / Math.sqrt(3),
  ROW = 1.5 * SIZE,
  SIN60 = Math.sqrt(3) / 2;

// How far `t` is from the nearest odd whole number.
const fromOdd = (t: number): number =>
  Math.abs(t - (2 * Math.round((t - 1) / 2) + 1));

// How far the point (`du`, `dv`) from a hex's middle is across it: as far as it is from the middle along the nearest
//  of its sides' ways out, so a point on its outline is half a square across.
const hexAcross = (du: number, dv: number): number =>
  Math.max(
    Math.abs(du),
    Math.abs(du / 2 + dv * SIN60),
    Math.abs(du / 2 - dv * SIN60)
  );

/**
 * How far the point (`u`, `v`) on the ground is from the nearest edge of the square it's on, on `grid`, and that edge's
 *  way across, a unit long, either way: 0 on an edge, and at most half a square's width at its middle.
 */
export const nearestEdge = (
  grid: TopologyId,
  u: number,
  v: number
): { distance: number; normal: [number, number] } => {
  if (grid === 'staggered-iso') {
    // Turned an eighth of a turn, the diamonds are squares, with edges where `u + v` and `v - u` are odd multiples of
    //  `HALF`.
    const along = fromOdd((u + v) / HALF),
      down = fromOdd((v - u) / HALF);

    return {
      distance: (HALF * Math.min(along, down)) / Math.SQRT2,
      normal: along < down ? [HALF, HALF] : [-HALF, HALF],
    };
  }

  if (grid === 'hex-odd-r') {
    // The hex it's on is the nearest by how far across it is: in the row of middles above it or the one below. Its
    //  nearest side is the one it's furthest along the way out to.
    const above = Math.floor((v - SIZE) / ROW);
    let nearest = Infinity,
      normal: [number, number] = [1, 0];

    for (const row of [above, above + 1]) {
      const shift = 0.5 + (((row % 2) + 2) % 2) * 0.5,
        du = u - (Math.round(u - shift) + shift),
        dv = v - SIZE - row * ROW,
        ways = [
          Math.abs(du),
          Math.abs(du / 2 + dv * SIN60),
          Math.abs(du / 2 - dv * SIN60),
        ],
        across = Math.max(...ways);

      if (across < nearest) {
        nearest = across;
        normal =
          ways[0]! >= ways[1]! && ways[0]! >= ways[2]!
            ? [1, 0]
            : ways[1]! >= ways[2]!
            ? [0.5, SIN60]
            : [0.5, -SIN60];
      }
    }

    return { distance: 0.5 - nearest, normal };
  }

  const across = u - Math.floor(u),
    down = v - Math.floor(v),
    fromSide = Math.min(across, 1 - across),
    fromTop = Math.min(down, 1 - down);

  return {
    distance: Math.min(fromSide, fromTop),
    normal: fromSide < fromTop ? [1, 0] : [0, 1],
  };
};

/** How far the point (`u`, `v`) on the ground is from the nearest edge of the square it's on, on `grid`. */
export const edgeDistance = (grid: TopologyId, u: number, v: number): number =>
  nearestEdge(grid, u, v).distance;

// A number as GLSL takes it.
const number = (n: number): string => (Number.isInteger(n) ? `${n}.0` : `${n}`);

/**
 * `nearestEdge` on `grid`, as GLSL: `float gridEdge(vec2 ground, out vec2 normal)`, the distance returned and the way
 *  across set, by the same sums.
 */
export const gridGlsl = (grid: TopologyId): string => {
  if (grid === 'staggered-iso') {
    return `float gridFromOdd(float t) {
  return abs(t - (2.0 * floor((t - 1.0) / 2.0 + 0.5) + 1.0));
}

float gridEdge(vec2 ground, out vec2 normal) {
  float corner = ${number(HALF)};
  float along = gridFromOdd((ground.x + ground.y) / corner), down = gridFromOdd((ground.y - ground.x) / corner);

  normal = along < down ? vec2(corner, corner) : vec2(-corner, corner);

  return corner * min(along, down) / ${number(Math.SQRT2)};
}`;
  }

  if (grid === 'hex-odd-r') {
    return `float gridEdge(vec2 ground, out vec2 normal) {
  float size = ${number(SIZE)}, row = ${number(ROW)}, sin60 = ${number(SIN60)};
  float above = floor((ground.y - size) / row), nearest = 1e9;

  normal = vec2(1.0, 0.0);

  for (int k = 0; k < 2; k++) {
    float r = above + float(k), shift = 0.5 + mod(r, 2.0) * 0.5;
    vec2 off = ground - vec2(floor(ground.x - shift + 0.5) + shift, size + r * row);
    float w0 = abs(off.x), w1 = abs(off.x / 2.0 + off.y * sin60), w2 = abs(off.x / 2.0 - off.y * sin60);
    float across = max(w0, max(w1, w2));

    if (across < nearest) {
      nearest = across;
      normal = w0 >= w1 && w0 >= w2 ? vec2(1.0, 0.0) : w1 >= w2 ? vec2(0.5, sin60) : vec2(0.5, -sin60);
    }
  }

  return 0.5 - nearest;
}`;
  }

  return `float gridEdge(vec2 ground, out vec2 normal) {
  vec2 inside = fract(ground), off = min(inside, 1.0 - inside);

  normal = off.x < off.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);

  return min(off.x, off.y);
}`;
};

/**
 * The lines' material, for the land's chunks drawn again over the land on `grid`: each point `GRID.lift` over the land,
 *  or over the sea's surface, and drawn only where it's near an edge, as dark as `GRID.opacity`, and not where the
 *  land's wholly on squares never seen (`unseen`, each point's, as the chunks give it). Seen through, writing no depth, and pulled in front of what
 *  it lies on as the square under the pointer's light is (`Stage`'s `highlightMaterial`), for the same reasons. Hidden
 *  as it comes.
 */
export const gridMaterial = (grid: TopologyId): MeshBasicMaterial => {
  const material = new MeshBasicMaterial({
    color: new Color(0x000000),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });

  material.visible = false;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float unseen;
varying vec2 vGround;
varying float vUnseen;
${shader.vertexShader.replace(
  '#include <begin_vertex>',
  `#include <begin_vertex>
  transformed.y = max(transformed.y + ${number(GRID.lift)}, ${number(
    GRID.lift
  )});
  vGround = (modelMatrix * vec4(transformed, 1.0)).xz;
  vUnseen = unseen;`
)}`;
    shader.fragmentShader = `varying vec2 vGround;
varying float vUnseen;
${gridGlsl(grid)}
${shader.fragmentShader.replace(
  '#include <color_fragment>',
  `#include <color_fragment>
  vec2 normal;
  float edge = gridEdge(vGround, normal),
    // How far apart on the ground the screen's pixels are, here: across the nearest edge, from where they are on the
    //  ground rather than how far they are from the edge, which folds at the line and would say none on it; and
    //  along either way.
    pixel = max(abs(dot(normal, dFdx(vGround))) + abs(dot(normal, dFdy(vGround))), 1e-6),
    across = max(fwidth(vGround.x), fwidth(vGround.y)),
    reach = max(${number(GRID.half)}, pixel * ${number(GRID.leastPixels)}),
    line = ${number(GRID.opacity)} * (${number(GRID.half)} / reach) *
      // Its edge ramped straight across a pixel, so however a line falls between pixels, it's as dark in all.
      (1.0 - clamp((edge - reach + pixel * 0.5) / pixel, 0.0, 1.0)) *
      (1.0 - smoothstep(${number(1 / GRID.fadedFrom)}, ${number(
    1 / GRID.goneAt
  )}, across)) *
      // Not on a square never seen: only where every point round it is, so the line along the edge of what's been seen
      //  keeps its inner half at least, whichever square its points were taken from. It can reach a step past it,
      //  under the cloud's soft edge, over the land seen carried on there (#1393), which may stand over the cloud.
      (1.0 - step(0.999, vUnseen));

  if (line < 0.004) {
    discard;
  }

  diffuseColor.a *= line;`
)}`;
  };
  material.customProgramCacheKey = () => `grid-${grid}`;

  return material;
};

export default gridMaterial;
