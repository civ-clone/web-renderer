// What each square yields, as three.js draws it (`yields.ts` lays them out): every icon one instance of a quad, facing
//  the camera and upright on the screen, standing over its square's middle, its size in the world's units, so it
//  shrinks with distance as the land does. One draw call for each copy of the world in sight.
//
// The icons are the interface's, drawn into an atlas: each in a cell with room round it, so smaller copies of the atlas
//  (for icons far off) don't run one into the next. Drawn crisp up close, as the 2D map draws pixel art, and smoothed
//  smaller. They're tested against the depth of what's drawn, so a hill in front hides them; but nearer the camera than
//  they are by `DEPTH_BIAS`, so what stands on their own square (its trees, its unit, its city) and its slope don't.

import {
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
} from 'three';
import { YieldMesh } from './yields';

/** How far nearer the camera the icons are, for what's in front of them, in the world's units: a square's things. */
export const DEPTH_BIAS = 0.6;

/** How far over the land the icons stand, in the world's units. */
export const YIELDS_LIFT = 0.05;

// An atlas cell's size in px, and the room round its icon on each side, as a share of the cell.
const CELL = 64,
  PAD = 0.125;

const vertexShader = /* glsl */ `
  attribute vec3 anchor;
  attribute vec2 slot;
  attribute float size;
  attribute float cell;

  uniform float lean;
  uniform float lift;
  uniform float bias;
  uniform vec2 cells;
  uniform float pad;

  varying vec2 vUv;

  #include <fog_pars_vertex>

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(anchor + vec3(0.0, lift, 0.0), 1.0);

    // Upright on the screen, facing the camera: its place in its block, across and up the screen.
    mvPosition.xy += (slot + position.xy) * size * lean;
    gl_Position = projectionMatrix * mvPosition;

    // Its depth as if it were nearer the camera along the same line of sight, by bias.
    float away = length(mvPosition.xyz);
    vec4 nearer = projectionMatrix * vec4(mvPosition.xyz * max(0.0, (away - bias) / away), 1.0);

    gl_Position.z = nearer.z / nearer.w * gl_Position.w;

    // Its cell in the atlas, the room round the icon left out: rows from the top, as the atlas is drawn.
    float column = mod(cell, cells.x);
    // Half a cell on, so rounding on the GPU doesn't put it a row out.
    float row = floor((cell + 0.5) / cells.x);
    vec2 inCell = vec2(pad) + uv * (1.0 - 2.0 * pad);

    vUv = vec2((column + inCell.x) / cells.x, 1.0 - (row + 1.0 - inCell.y) / cells.y);

    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D atlas;

  varying vec2 vUv;

  #include <fog_pars_fragment>

  void main() {
    vec4 colour = texture2D(atlas, vUv);

    if (colour.a < 0.25) {
      discard;
    }

    // Smaller, an icon's edge is its colour mixed with the clear, black, round it: that colour again, not darkened.
    gl_FragColor = vec4(colour.rgb / max(colour.a, 1e-4), 1.0);

    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** How many cells across and down an atlas of `count` icons has: square, or as near as it gets. */
export const atlasCells = (count: number): [number, number] => {
  const across = Math.max(1, Math.ceil(Math.sqrt(count)));

  return [across, Math.max(1, Math.ceil(count / across))];
};

/** Where in the atlas each icon of `names` goes, in px: its cell's top left, and the box it's drawn in, keeping its shape. */
export const atlasPlaces = (
  names: readonly string[],
  sizeOf: (name: string) => [number, number] | null
): { _: string; x: number; y: number; width: number; height: number }[] => {
  const [across] = atlasCells(names.length),
    room = CELL * (1 - 2 * PAD);

  return names.flatMap((_, index) => {
    const size = sizeOf(_);

    if (size === null || size[0] <= 0 || size[1] <= 0) {
      return [];
    }

    const scale = room / Math.max(size[0], size[1]),
      width = size[0] * scale,
      height = size[1] * scale;

    return [
      {
        _,
        x: (index % across) * CELL + (CELL - width) / 2,
        y: Math.floor(index / across) * CELL + (CELL - height) / 2,
        width,
        height,
      },
    ];
  });
};

// How big an image is, in its own px.
const imageSize = (image: CanvasImageSource): [number, number] => {
  const { naturalWidth, naturalHeight, width, height } = image as {
    naturalWidth?: number;
    naturalHeight?: number;
    width?: unknown;
    height?: unknown;
  };

  return [
    naturalWidth ?? (typeof width === 'number' ? width : 0),
    naturalHeight ?? (typeof height === 'number' ? height : 0),
  ];
};

/** The yields' icons on the stage: what it draws at each copy of the world, made again when they change. */
export class YieldIcons {
  readonly material: ShaderMaterial;
  #geometry: InstancedBufferGeometry | null = null;
  #atlas: CanvasTexture | null = null;
  // What the atlas was drawn of: each icon's name and art, in their cells.
  #atlasKey = '';
  #iconFor: (name: string) => CanvasImageSource | null;

  constructor(iconFor: (name: string) => CanvasImageSource | null) {
    this.#iconFor = iconFor;
    this.material = new ShaderMaterial({
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          atlas: { value: null },
          lean: { value: 1 },
          lift: { value: YIELDS_LIFT },
          bias: { value: DEPTH_BIAS },
          cells: { value: [1, 1] },
          pad: { value: PAD },
        },
      ]),
      vertexShader,
      fragmentShader,
      fog: true,
      // Their own colours, as the interface draws them, not the scene's tone.
      toneMapped: false,
    });
  }

  /** How big the icons stand, as the camera looks down from `pitch` radians: smaller, keeping their shape, the lower it looks. */
  lean(pitch: number): void {
    this.material.uniforms['lean']!.value = Math.sin(pitch);
  }

  /** The icons to draw now, or none: what's drawn of them made again. */
  set(mesh: YieldMesh | null): InstancedBufferGeometry | null {
    this.#geometry?.dispose();
    this.#geometry = null;

    if (mesh === null || mesh.count === 0) {
      return null;
    }

    this.#drawAtlas(mesh);

    const geometry = new InstancedBufferGeometry();

    // A quad of its own: letting a geometry go lets go of all it holds.
    const quad = new PlaneGeometry(1, 1);

    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('uv', quad.getAttribute('uv'));
    geometry.setAttribute(
      'anchor',
      new InstancedBufferAttribute(mesh.anchors, 3)
    );
    geometry.setAttribute('slot', new InstancedBufferAttribute(mesh.slots, 2));
    geometry.setAttribute('size', new InstancedBufferAttribute(mesh.sizes, 1));
    geometry.setAttribute('cell', new InstancedBufferAttribute(mesh.cells, 1));
    geometry.instanceCount = mesh.count;
    this.#geometry = geometry;

    return geometry;
  }

  /** One copy of the icons, for a copy of the world. */
  make(): Object3D {
    const drawn = new Mesh(this.#geometry ?? undefined, this.material);

    // Its quads are moved in the shader: three.js can't tell where they are.
    drawn.frustumCulled = false;
    drawn.castShadow = false;
    drawn.receiveShadow = false;

    return drawn;
  }

  // Each image a number of its own, for the atlas's key: 0 for none.
  #imageIds = new WeakMap<object, number>();
  #nextImageId = 1;

  #imageId(image: CanvasImageSource | null): number {
    if (image === null) {
      return 0;
    }

    let id = this.#imageIds.get(image);

    if (id === undefined) {
      id = this.#nextImageId++;
      this.#imageIds.set(image, id);
    }

    return id;
  }

  // The interface's icons, each in its cell, drawn again only when the icons in it, or their art, change.
  #drawAtlas(mesh: YieldMesh): void {
    // Drawn again for an icon whose art has arrived, or been replaced, since.
    const key = mesh.names
      .map((name) => `${name}:${this.#imageId(this.#iconFor(name))}`)
      .join(',');

    if (key === this.#atlasKey && this.#atlas !== null) {
      return;
    }

    const [across, down] = atlasCells(mesh.names.length),
      canvas = document.createElement('canvas'),
      context = canvas.getContext('2d');

    canvas.width = across * CELL;
    canvas.height = down * CELL;

    if (context !== null) {
      // Pixel art, as the 2D map draws it: each pixel a block, not blurred.
      context.imageSmoothingEnabled = false;
      atlasPlaces(mesh.names, (name) => {
        const image = this.#iconFor(name);

        return image === null ? null : imageSize(image);
      }).forEach(({ _, x, y, width, height }) => {
        const image = this.#iconFor(_);

        if (image !== null) {
          context.drawImage(image, x, y, width, height);
        }
      });
    }

    this.#atlas?.dispose();
    this.#atlas = new CanvasTexture(canvas);
    this.#atlas.colorSpace = SRGBColorSpace;
    this.#atlas.magFilter = NearestFilter;
    this.#atlas.minFilter = LinearMipmapLinearFilter;
    this.#atlas.generateMipmaps = true;
    this.#atlasKey = key;
    this.material.uniforms['atlas']!.value = this.#atlas;
    this.material.uniforms['cells']!.value = [across, down];
  }

  dispose(): void {
    this.#geometry?.dispose();
    this.#atlas?.dispose();
    this.material.dispose();
  }
}

export default YieldIcons;
