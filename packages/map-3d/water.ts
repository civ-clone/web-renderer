// The sea's surface on the 3D map (docs/3d-renderer.md §4.4, plan 1.4): one surface at height 0, drawn over the land
//  wherever the land is below it, coloured by how deep the water is there, clear at the shore and deep blue out at
//  sea, with foam where it meets the land, the sky in it at a low angle, and the sun's glint.
//
// How deep the water is comes from the land's own heights: each chunk, as it's built, writes its points' heights into a
//  texture the size of the ground (`Ground`), which the surface reads where it's drawn. The texture repeats as the
//  world does, so the surface needs no copies: it's one square of water as wide as the camera sees, under the camera.
//
// The same texture says which points are on squares never seen: no water is drawn there, and cloud covers them (§4.5),
//  a soft layer just over the low land round them (a hill or mountain beside them may stand through it), thinning over
//  a short edge, broken up by noise that repeats as the world does. A square seen once its chunk's been laid clears its
//  cloud over half a second (`Water#clear`), as the cloud has a channel of its own; the water's there at once.

import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
} from 'three';
import { ChunkMesh } from './terrain/chunks';

/** How the land's points lie on the ground: how many across and down, how far apart, and whether it wraps down. */
export type Ground = {
  columns: number;
  rows: number;
  spacingU: number;
  spacingV: number;
  wrapsV: boolean;
};

/**
 * The order what's see-through is drawn in, all of it after everything solid: the sea, then the grid's lines
 *  (`grid.ts`), then the square under the pointer lit (`highlight.ts`), then smog over the land, then the cloud, then
 *  what stands over units and cities (`markers/drawMarker.ts`). The sea and the cloud are each one plane across the
 *  world, which three.js can only order by this: it orders what's see-through by it, then by how far each thing's middle
 *  is, which says nothing for a plane that size. The lines, the light and smog are never under the sea's surface, so
 *  after it is always right: drawn before it, the sea would be painted over them. The light's after the lines, so it's
 *  drawn over the line at a square's edge on every chunk alike, not over some and under others as the camera moves.
 *  They can be over the cloud on high land, but the cloud's after them, as it's under them on low land, which is more
 *  often; and the light's never on a square never seen, nor the lines but a step past the edge of what has been.
 */
export const SEA_ORDER = 1,
  GRID_ORDER = 1.2,
  HIGHLIGHT_ORDER = 1.25,
  SMOG_ORDER = 1.5,
  CLOUD_ORDER = 2;

// Clear and green-blue at the shore, deep blue out at sea, as linear colours.
const SHALLOW = new Color('#3f8a8c'),
  DEEP = new Color('#173a52'),
  FOAM = new Color('#e8eeee');

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

varying vec3 vWorld;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec4 mvPosition = viewMatrix * world;

  vWorld = world.xyz;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform sampler2D ground;
uniform vec2 cell;
uniform vec2 size;
uniform vec3 shallow;
uniform vec3 deep;
uniform vec3 foam;
uniform vec3 sky;
uniform vec3 sunDirection;
uniform vec3 sunColour;
// How far the ground runs down, and whether it wraps down.
uniform float extentV;
uniform bool wrapsV;

varying vec3 vWorld;

void main() {
  // Past the poles of a world that doesn't wrap over them: no sea, as there's no land under it to read.
  if (!wrapsV && (vWorld.z < 0.0 || vWorld.z > extentV)) {
    discard;
  }

  // The land's height here, from its points, each a texel's middle.
  vec2 uv = (vWorld.xz / cell + 0.5) / size;
  vec4 here = texture2D(ground, uv);
  float depth = -here.r;

  // The land is above the water here, or it's never been seen: none to draw.
  if (depth <= 0.0 || here.g > 0.01) {
    discard;
  }

  vec3 toEye = normalize(cameraPosition - vWorld);
  vec3 colour = mix(shallow, deep, smoothstep(0.0, 0.12, depth));

  // The sky in the water, more at a low angle (Fresnel), and the sun's glint.
  float fresnel = pow(1.0 - clamp(toEye.y, 0.0, 1.0), 5.0);
  colour = mix(colour, sky, 0.12 + fresnel * 0.5);

  vec3 halfway = normalize(sunDirection + toEye);
  colour += sunColour * pow(max(halfway.y, 0.0), 300.0) * 0.5;

  // Foam where it meets the land, and clear water over the shallows.
  colour = mix(colour, foam, (1.0 - smoothstep(0.0, 0.01, depth)) * 0.6);

  gl_FragColor = vec4(colour, smoothstep(0.0, 0.004, depth) * 0.94);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** How long a square's cloud takes to clear once it's seen, in seconds (§4.5): at once under reduced motion. */
export const CLOUD_CLEARING = 0.5;

/**
 * How many points clearing at once are sent each on its own (`Water#clear`), at most: more, as when much of the world is
 *  seen at once, and the whole texture's sent instead. About 64 squares' worth.
 */
export const WHOLE_FROM = 4096;

// What the texture holds of each point, in turn.
const HEIGHT = 0,
  NEVER_SEEN = 1,
  CLOUD = 2,
  LAID = 3,
  CHANNELS = 4;

/** The sea's surface, and the land's heights it reads. */
export class Water {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  #ground: Ground;
  #heights: Uint16Array;
  #texture: DataTexture;
  // The points whose cloud is clearing, by their place in the texture: how much there was when it began, and when it
  //  began, in seconds, once it has (the first `clear` after they're seen).
  #clearing = new Map<number, { from: number; start: number | null }>();
  // Whether the whole texture's to be sent again, as a chunk's changed it: till it has been, the points clearing
  //  needn't be sent on their own.
  #whole = true;

  constructor(ground: Ground, sky: Color) {
    this.#ground = ground;
    // Half floats, which every WebGL2 can filter: at sea level, -0.2 to about 1.2, they're good to a thousandth. Four a point:
    //  its height; whether it's never been seen, which nothing has been yet, where no water's drawn; how much cloud is
    //  over it, the same but as it clears; and whether a chunk has been laid over it yet, as only then does a square
    //  seen clear its cloud rather than have none.
    this.#heights = new Uint16Array(ground.columns * ground.rows * CHANNELS);

    for (let at = 0; at < this.#heights.length; at += CHANNELS) {
      this.#heights[at + HEIGHT] = DataUtils.toHalfFloat(0);
      this.#heights[at + NEVER_SEEN] = DataUtils.toHalfFloat(1);
      this.#heights[at + CLOUD] = DataUtils.toHalfFloat(1);
      this.#heights[at + LAID] = DataUtils.toHalfFloat(0);
    }

    this.#texture = new DataTexture(
      this.#heights,
      ground.columns,
      ground.rows,
      RGBAFormat,
      HalfFloatType
    );
    // Sent: what changes next can be sent on its own.
    this.#texture.onUpdate = (): void => {
      this.#whole = false;
    };
    this.#texture.wrapS = RepeatWrapping;
    this.#texture.wrapT = ground.wrapsV ? RepeatWrapping : ClampToEdgeWrapping;
    this.#texture.magFilter = LinearFilter;
    this.#texture.minFilter = LinearFilter;
    this.#texture.needsUpdate = true;

    const material = new ShaderMaterial({
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          ground: { value: null },
          cell: { value: new Vector2() },
          size: { value: new Vector2() },
          shallow: { value: SHALLOW.clone() },
          deep: { value: DEEP.clone() },
          foam: { value: FOAM.clone() },
          sky: { value: sky.clone() },
          sunDirection: { value: new Vector3(0.5, 0.7, 0.4).normalize() },
          sunColour: { value: new Color('#fff0d8') },
          extentV: { value: 0 },
          wrapsV: { value: false },
        },
      ]),
      vertexShader,
      fragmentShader,
      fog: true,
      transparent: true,
      depthWrite: false,
    });

    material.uniforms['ground']!.value = this.#texture;
    material.uniforms['cell']!.value.set(ground.spacingU, ground.spacingV);
    material.uniforms['size']!.value.set(ground.columns, ground.rows);
    material.uniforms['extentV']!.value = ground.rows * ground.spacingV;
    material.uniforms['wrapsV']!.value = ground.wrapsV;

    this.mesh = new Mesh(new PlaneGeometry(1, 1), material);
    this.mesh.rotation.x = -Math.PI / 2;
    // Over the land, drawn after it as everything solid is, and before the smog and the cloud.
    this.mesh.renderOrder = SEA_ORDER;
  }

  /**
   * The chunk at its corner (`u`, `v`): its points' heights written into the ground the surface reads, and which are
   *  never seen. A point seen since its chunk was last laid has its water at once, and its cloud clears (`clear`).
   */
  setChunk(mesh: ChunkMesh): void {
    const { columns, rows, spacingU, spacingV } = this.#ground,
      firstColumn = Math.round(mesh.u / spacingU),
      firstRow = Math.round(mesh.v / spacingV),
      points = mesh.positions.length / 3;

    for (let point = 0; point < points; point++) {
      const column =
          firstColumn + Math.round((mesh.positions[point * 3] ?? 0) / spacingU),
        row =
          firstRow +
          Math.round((mesh.positions[point * 3 + 2] ?? 0) / spacingV);

      if (column >= 0 && column < columns && row >= 0 && row < rows) {
        const place = row * columns + column,
          at = place * CHANNELS,
          unseen = mesh.unseen[point] ?? 0,
          cloud = this.#channel(at + CLOUD);

        this.#heights[at + HEIGHT] = DataUtils.toHalfFloat(
          mesh.positions[point * 3 + 1] ?? 0
        );
        this.#heights[at + NEVER_SEEN] = DataUtils.toHalfFloat(unseen);

        // Seen, where its cloud's been drawn: it clears from there, if it isn't already. Otherwise, as it is.
        if (unseen === 0 && cloud > 0 && this.#channel(at + LAID) > 0.5) {
          if (!this.#clearing.has(place)) {
            this.#clearing.set(place, { from: cloud, start: null });
          }
        } else {
          this.#clearing.delete(place);
          this.#heights[at + CLOUD] = DataUtils.toHalfFloat(unseen);
        }

        this.#heights[at + LAID] = DataUtils.toHalfFloat(1);
      }
    }

    // The whole texture sent again, rather than the points that have changed.
    this.#texture.clearUpdateRanges();
    this.#texture.needsUpdate = true;
    this.#whole = true;
  }

  /**
   * The cloud over the points seen since their chunks were laid cleared as far as it has `now`, in seconds, over
   *  `seconds` from the first time it's asked after they're seen (at once for none). Says whether any still clears.
   */
  clear(now: number, seconds: number): boolean {
    if (this.#clearing.size === 0) {
      return false;
    }

    // The whole texture sent rather than each point: where what was asked last time was never sent (the context lost
    //  meanwhile, and made again empty), or where so much clears at once that one upload is cheaper.
    if (
      this.#texture.updateRanges.length > 0 ||
      this.#clearing.size > WHOLE_FROM
    ) {
      this.#texture.clearUpdateRanges();
      this.#whole = true;
    }

    this.#clearing.forEach((clearing, place) => {
      if (clearing.start === null) {
        clearing.start = now;
      }

      const gone = seconds > 0 ? (now - clearing.start) / seconds : 1,
        at = place * CHANNELS + CLOUD;

      this.#heights[at] = DataUtils.toHalfFloat(
        gone >= 1 ? 0 : clearing.from * (1 - gone)
      );

      // Only the point that's changed sent, where the whole texture isn't to be (each point is its 4 channels).
      if (!this.#whole) {
        this.#texture.addUpdateRange(place * CHANNELS, CHANNELS);
      }

      if (gone >= 1) {
        this.#clearing.delete(place);
      }
    });

    this.#texture.needsUpdate = true;

    return this.#clearing.size > 0;
  }

  #channel(at: number): number {
    return DataUtils.fromHalfFloat(this.#heights[at] ?? 0);
  }

  /** The land's height the surface reads at the ground's point `column` across and `row` down. */
  height(column: number, row: number): number {
    return this.#channel(
      (row * this.#ground.columns + column) * CHANNELS + HEIGHT
    );
  }

  /** Whether the ground's point `column` across and `row` down is on a square never seen, where no water's drawn. */
  unseen(column: number, row: number): boolean {
    return (
      this.#channel(
        (row * this.#ground.columns + column) * CHANNELS + NEVER_SEEN
      ) > 0.5
    );
  }

  /** How much cloud is over the ground's point `column` across and `row` down, as the cloud reads it: 1 to none. */
  cloud(column: number, row: number): number {
    return this.#channel(
      (row * this.#ground.columns + column) * CHANNELS + CLOUD
    );
  }

  /** The texture the land's heights, unseen points and cloud are in, for the cloud. */
  texture(): DataTexture {
    return this.#texture;
  }

  /**
   * Whether it's drawn past the poles: only on a world that wraps over them, and not where the player has stopped the
   *  map at them.
   */
  pastThePoles(shown: boolean): void {
    this.mesh.material.uniforms['wrapsV']!.value = this.#ground.wrapsV && shown;
  }

  /** The surface under the camera, round (`u`, `v`), `across` wide, and the sun's direction for its glint. */
  follow(u: number, v: number, across: number, sun: Vector3): void {
    this.mesh.position.set(u, 0, v);
    this.mesh.scale.set(across, across, 1);
    this.mesh.material.uniforms['sunDirection']!.value.copy(sun).normalize();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.#texture.dispose();
  }
}

export default Water;

const cloudFragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform sampler2D ground;
uniform vec2 cell;
uniform vec2 size;
// How far the ground runs across and down, and whether it wraps down.
uniform vec2 extent;
uniform bool wrapsV;

varying vec3 vWorld;

// Value noise, from a hash of the lattice's corners.
float lattice(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

// Noise that repeats as the world does: \`cells\` lattice cells across and down it, taken round at its edges, so the
//  cloud looks the same wherever the camera crosses the world's wrap.
float noise(vec2 point, vec2 cells) {
  vec2 corner = floor(point),
    along = fract(point),
    eased = along * along * (3.0 - 2.0 * along),
    first = mod(corner, cells),
    next = mod(corner + 1.0, cells);

  return mix(
    mix(lattice(first), lattice(vec2(next.x, first.y)), eased.x),
    mix(lattice(vec2(first.x, next.y)), lattice(next), eased.x),
    eased.y
  );
}

// How much cloud's over the ground at a point, as it clears.
float unseenAt(vec2 point) {
  return texture2D(ground, (point / cell + 0.5) / size).b;
}

void main() {
  // Past the poles of a world that doesn't wrap over them: no cloud, as there's nothing to have seen.
  if (!wrapsV && (vWorld.z < 0.0 || vWorld.z > extent.y)) {
    discard;
  }

  // Softened over a short edge: how much of the ground round here has never been seen.
  float unseen = 0.0;

  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      unseen += unseenAt(vWorld.xz + vec2(float(i), float(j)) * 0.18);
    }
  }

  unseen /= 9.0;

  vec2 coarse = max(vec2(1.0), floor(extent * 1.4 + 0.5)),
    fine = max(vec2(1.0), floor(extent * 3.7 + 0.5));
  float puff =
      noise(vWorld.xz / extent * coarse, coarse) * 0.6 +
      noise(vWorld.xz / extent * fine, fine) * 0.4,
    alpha = smoothstep(0.3, 0.7, unseen + (puff - 0.5) * 0.45);

  if (alpha <= 0.0) {
    discard;
  }

  gl_FragColor = vec4(mix(vec3(0.62, 0.67, 0.74), vec3(0.94, 0.95, 0.97), puff), alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** How high the cloud over the squares never seen floats, in world units: over the land round them. */
export const CLOUD_HEIGHT = 0.18;

/** The cloud over the squares never seen (§4.5), reading where they are from the water's texture. */
export class Clouds {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  // Whether the world wraps over the poles.
  #wrapsV: boolean;

  constructor(texture: DataTexture, ground: Ground) {
    this.#wrapsV = ground.wrapsV;

    const material = new ShaderMaterial({
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          ground: { value: null },
          cell: { value: new Vector2() },
          size: { value: new Vector2() },
          extent: { value: new Vector2() },
          wrapsV: { value: false },
        },
      ]),
      vertexShader,
      fragmentShader: cloudFragmentShader,
      fog: true,
      transparent: true,
      depthWrite: false,
    });

    material.uniforms['ground']!.value = texture;
    material.uniforms['cell']!.value.set(ground.spacingU, ground.spacingV);
    material.uniforms['size']!.value.set(ground.columns, ground.rows);
    material.uniforms['extent']!.value.set(
      ground.columns * ground.spacingU,
      ground.rows * ground.spacingV
    );
    material.uniforms['wrapsV']!.value = ground.wrapsV;

    this.mesh = new Mesh(new PlaneGeometry(1, 1), material);
    this.mesh.rotation.x = -Math.PI / 2;
    // Over the land and the sea, drawn after them and the smog.
    this.mesh.renderOrder = CLOUD_ORDER;
  }

  /** Whether it's drawn past the poles: only on a world that wraps over them, and not where the map's stopped there. */
  pastThePoles(shown: boolean): void {
    this.mesh.material.uniforms['wrapsV']!.value = this.#wrapsV && shown;
  }

  /** The cloud under the camera, round (`u`, `v`), `across` wide. */
  follow(u: number, v: number, across: number): void {
    this.mesh.position.set(u, CLOUD_HEIGHT, v);
    this.mesh.scale.set(across, across, 1);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
