// The sea's surface on the 3D map (docs/3d-renderer.md §4.4, plan 1.4): one surface at height 0, drawn over the land
//  wherever the land is below it, coloured by how deep the water is there, clear at the shore and deep blue out at
//  sea, with foam where it meets the land, the sky in it at a low angle, and the sun's glint.
//
// How deep the water is comes from the land's own heights: each chunk, as it's built, writes its points' heights into a
//  texture the size of the ground (`Ground`), which the surface reads where it's drawn. The texture repeats as the
//  world does, so the surface needs no copies: it's one square of water as wide as the camera sees, under the camera.

import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RedFormat,
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

varying vec3 vWorld;

void main() {
  // The land's height here, from its points, each a texel's middle.
  vec2 uv = (vWorld.xz / cell + 0.5) / size;
  float depth = -texture2D(ground, uv).r;

  // The land is above the water here: none to draw.
  if (depth <= 0.0) {
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

/** The sea's surface, and the land's heights it reads. */
export class Water {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  #ground: Ground;
  #heights: Uint16Array;
  #texture: DataTexture;

  constructor(ground: Ground, sky: Color) {
    this.#ground = ground;
    // Half floats, which every WebGL2 can filter: at sea level, -0.2 to 1, they're good to a thousandth.
    this.#heights = new Uint16Array(ground.columns * ground.rows).fill(
      DataUtils.toHalfFloat(0)
    );
    this.#texture = new DataTexture(
      this.#heights,
      ground.columns,
      ground.rows,
      RedFormat,
      HalfFloatType
    );
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

    this.mesh = new Mesh(new PlaneGeometry(1, 1), material);
    this.mesh.rotation.x = -Math.PI / 2;
    // Over the land, which it's drawn after.
    this.mesh.renderOrder = 1;
  }

  /** The chunk at its corner (`u`, `v`): its points' heights written into the ground the surface reads. */
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
        this.#heights[row * columns + column] = DataUtils.toHalfFloat(
          mesh.positions[point * 3 + 1] ?? 0
        );
      }
    }

    this.#texture.needsUpdate = true;
  }

  /** The land's height the surface reads at the ground's point `column` across and `row` down. */
  height(column: number, row: number): number {
    return DataUtils.fromHalfFloat(
      this.#heights[row * this.#ground.columns + column] ?? 0
    );
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
