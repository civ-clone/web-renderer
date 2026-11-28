// What stands over units and cities on the 3D map (`drawMarker.ts`: their flags, bars, labels and names), drawn all
//  together: every badge in sight is an instance of one quad, in one draw call, where each was a draw call of its own
//  (#1424). Each is still a `Sprite` in its marker, placed, copied, walked, flown and faded as before, but on a layer
//  of its own (`BADGE_LAYER`) that the camera doesn't draw. The stage gathers them as it draws (`Badges#gather`) and
//  draws them as three.js draws a sprite, the same size on the screen however far away, over all, far before near.
//  The pointer over the unit awaiting orders stays a sprite of its own, drawn after them all.
//
// The labels' pictures are copied into one atlas (`BadgeAtlas`), each with its edges drawn on round it, so it's drawn
//  as its own picture was; a flag or a bar is a plain colour, drawn from a white block in it.

import {
  Camera,
  CanvasTexture,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  Sprite,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';

/** The layer badges are on: not the camera's, as they're drawn together (`Badges`). */
export const BADGE_LAYER = 1;

/** Where a picture is in the atlas, as a share of it, from its bottom left: across, up, its width and its height. */
export type Cell = readonly [number, number, number, number];

/** What a picture in the atlas is drawn from: a label's canvas. */
export type BadgeImage = CanvasImageSource & { width: number; height: number };

/**
 * One badge to draw: where it stands (`at`, in the world), its size on the screen (`size`, in the screen's units, as a
 *  sprite's scale is), the point of it that stands there (`centre`, as a sprite's), its colour, how solid it is, and
 *  where its picture is in the atlas.
 */
export type BadgeInstance = {
  at: [number, number, number];
  size: [number, number];
  centre: [number, number];
  colour: [number, number, number, number];
  cell: Cell;
};

const vertexShader = /* glsl */ `
  attribute vec3 anchor;
  attribute vec2 size;
  attribute vec2 centre;
  attribute vec4 colour;
  attribute vec4 cell;

  varying vec2 vUv;
  varying vec4 vColour;

  #include <common>
  #include <fog_pars_vertex>

  void main() {
    // As three.js draws a sprite that isn't sized by its distance (sprite.glsl.js): the same size on the screen.
    vec4 mvPosition = viewMatrix * vec4(anchor, 1.0);
    vec2 scale = size;

    if (isPerspectiveMatrix(projectionMatrix)) {
      scale *= -mvPosition.z;
    }

    mvPosition.xy += (position.xy - (centre - vec2(0.5))) * scale;
    gl_Position = projectionMatrix * mvPosition;

    vUv = cell.xy + uv * cell.zw;
    vColour = colour;

    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D atlas;

  varying vec2 vUv;
  varying vec4 vColour;

  #include <common>
  #include <fog_pars_fragment>

  void main() {
    vec4 diffuseColor = vColour * texture2D(atlas, vUv);

    gl_FragColor = vec4(diffuseColor.rgb, diffuseColor.a);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// The atlas's width, the heights it starts at and goes up to, in px, and the room round each picture, its edges drawn
//  on into it: enough for the smaller copies of the atlas a badge's drawn from (a label's drawn at about its size).
const ATLAS_WIDTH = 1024,
  ATLAS_HEIGHT = 256,
  ATLAS_MOST = 4096,
  PAD = 4,
  // The white block a plain badge is drawn from: big enough that its smaller copies' middles stay white.
  WHITE = 16,
  // Copied afresh, how much of it may be taken before it's grown, so a label more doesn't copy it all afresh again.
  FULL = 0.75,
  // How many pictures it may hold that aren't drawn any more, and twice as many as are, before it's copied afresh
  //  with those that are: labels no marker shows any more, let go of by the kit (`MarkerKit#sweep`).
  UNDRAWN = 64;

/** Whether a picture `width` by `height` fits in the atlas at the most it grows to, with room round it. */
const fitsAtAll = ({ width, height }: { width: number; height: number }) =>
  width > 0 &&
  height > 0 &&
  width + PAD * 2 <= ATLAS_WIDTH &&
  height + PAD * 2 <= ATLAS_MOST - (WHITE + PAD * 2);

/**
 * Where pictures go in an atlas `width` wide and `height` tall, each `pad` from the next and from the edges: in rows,
 *  each as tall as the first picture put in it, left to right; a picture in the first row that's as tall and has room.
 *  Nothing where one doesn't fit.
 */
export class Shelves {
  #rows: { y: number; height: number; x: number }[] = [];
  #below = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly pad: number
  ) {}

  /** Where a picture `width` by `height` goes, its top left, in px; or nothing, with no room. */
  place(width: number, height: number): [number, number] | null {
    const { pad } = this,
      across = width + pad * 2,
      tall = height + pad * 2;

    if (across > this.width) {
      return null;
    }

    let row = this.#rows.find(
      (row) => row.height === tall && row.x + across <= this.width
    );

    if (row === undefined) {
      if (this.#below + tall > this.height) {
        return null;
      }

      row = { y: this.#below, height: tall, x: 0 };
      this.#rows.push(row);
      this.#below += tall;
    }

    const at: [number, number] = [row.x + pad, row.y + pad];

    row.x += across;

    return at;
  }

  /** How far down its rows reach, in px. */
  get used(): number {
    return this.#below;
  }
}

/**
 * The labels' pictures, in one texture: each copied in once, as it's first drawn, and all copied in afresh, of those
 *  drawn now, when one doesn't fit, the atlas growing if they don't, up to its most (`ATLAS_MOST`). A white block for
 *  plain badges.
 */
export class BadgeAtlas {
  #canvas: HTMLCanvasElement | null = null;
  #texture: CanvasTexture | null = null;
  #shelves = new Shelves(ATLAS_WIDTH, ATLAS_HEIGHT, PAD);
  #cells = new Map<BadgeImage, Cell>();
  #plain: Cell = [0, 0, 0, 0];
  #changed = false;
  // The pictures it last couldn't hold all of at its most: held as many as fit, it isn't copied afresh again for them.
  #short: Set<BadgeImage> | null = null;

  /** The atlas's texture: made afresh as it grows. */
  get texture(): CanvasTexture | null {
    return this.#texture;
  }

  /** Where a plain badge's colour is drawn from: the middle of the white block. */
  get plain(): Cell {
    this.#ready();

    return this.#plain;
  }

  /** Where `image` is in the atlas, if it's been copied in. */
  cellOf(image: BadgeImage): Cell | null {
    return this.#cells.get(image) ?? null;
  }

  /**
   * Has `images` in the atlas, as far as they fit: those not in it copied in, none stopping the rest. Where any doesn't
   *  fit, or it holds many more than these, these alone are copied in afresh, on an atlas twice as tall where they
   *  don't fit or take most of it, up to its most. Where they don't all fit at its most, it holds as many as do, and
   *  isn't copied afresh again till the pictures asked for change. One too big to fit at all is never held.
   */
  hold(images: Iterable<BadgeImage>): void {
    this.#ready();

    const wanted = [...new Set(images)].filter(fitsAtAll),
      missing = wanted.filter(
        (image) => !this.#cells.has(image) && !this.#add(image)
      ),
      undrawn =
        this.#cells.size > Math.max(UNDRAWN, wanted.length * 2) &&
        this.#cells.size > wanted.length + UNDRAWN,
      short = this.#short;

    if (
      (missing.length === 0 && !undrawn) ||
      (missing.length > 0 &&
        short !== null &&
        short.size === wanted.length &&
        wanted.every((image) => short.has(image)))
    ) {
      this.#finish();

      return;
    }

    this.#short = null;

    for (let height = this.#shelves.height; ; height *= 2) {
      this.#start(height);

      const left = wanted.filter((image) => !this.#add(image));

      if (
        height >= ATLAS_MOST ||
        (left.length === 0 && this.#shelves.used <= height * FULL)
      ) {
        if (left.length > 0) {
          this.#short = new Set(wanted);
        }

        break;
      }
    }

    this.#finish();
  }

  dispose(): void {
    this.#texture?.dispose();
    this.#texture = null;
    this.#canvas = null;
    this.#cells.clear();
    this.#short = null;
  }

  // Made as it's first wanted: the page's canvas.
  #ready(): void {
    if (this.#canvas === null) {
      this.#start(this.#shelves.height);
    }
  }

  // An empty atlas `height` tall, but for its white block: a new canvas and texture where it's grown.
  #start(height: number): void {
    const grown = this.#canvas === null || this.#canvas.height !== height;

    if (grown) {
      this.#canvas = document.createElement('canvas');
      this.#canvas.width = ATLAS_WIDTH;
      this.#canvas.height = height;
      this.#texture?.dispose();
      this.#texture = new CanvasTexture(this.#canvas);
      this.#texture.colorSpace = SRGBColorSpace;
    }

    this.#shelves = new Shelves(ATLAS_WIDTH, height, PAD);
    this.#cells.clear();

    const context = this.#canvas!.getContext('2d'),
      white = this.#shelves.place(WHITE, WHITE)!;

    if (context !== null) {
      context.clearRect(0, 0, ATLAS_WIDTH, height);
      // Its edges copied out pixel for pixel, not blurred with what's next to them.
      context.imageSmoothingEnabled = false;
      context.fillStyle = '#ffffff';
      context.fillRect(white[0], white[1], WHITE, WHITE);
    }

    this.#plain = [
      (white[0] + WHITE / 2) / ATLAS_WIDTH,
      1 - (white[1] + WHITE / 2) / height,
      0,
      0,
    ];
    this.#changed = true;
  }

  // Copies `image` in, its edges drawn on round it, so what's drawn just past its edge is its edge, as a picture of its
  //  own clamps there: whether it fit.
  #add(image: BadgeImage): boolean {
    const { width, height } = image;

    if (width <= 0 || height <= 0) {
      return false;
    }

    const at = this.#shelves.place(width, height);

    if (at === null) {
      return false;
    }

    const [x, y] = at,
      context = this.#canvas!.getContext('2d');

    if (context !== null) {
      const edge = (
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        dx: number,
        dy: number,
        dw: number,
        dh: number
      ): void => context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);

      // Its sides, then its corners, then the picture.
      edge(0, 0, 1, height, x - PAD, y, PAD, height);
      edge(width - 1, 0, 1, height, x + width, y, PAD, height);
      edge(0, 0, width, 1, x, y - PAD, width, PAD);
      edge(0, height - 1, width, 1, x, y + height, width, PAD);
      edge(0, 0, 1, 1, x - PAD, y - PAD, PAD, PAD);
      edge(width - 1, 0, 1, 1, x + width, y - PAD, PAD, PAD);
      edge(0, height - 1, 1, 1, x - PAD, y + height, PAD, PAD);
      edge(width - 1, height - 1, 1, 1, x + width, y + height, PAD, PAD);
      context.drawImage(image, x, y);
    }

    const tall = this.#shelves.height;

    this.#cells.set(image, [
      x / ATLAS_WIDTH,
      1 - (y + height) / tall,
      width / ATLAS_WIDTH,
      height / tall,
    ]);
    this.#changed = true;

    return true;
  }

  // Sent again, once it's changed.
  #finish(): void {
    if (this.#changed && this.#texture !== null) {
      this.#texture.needsUpdate = true;
    }

    this.#changed = false;
  }
}

const position = new Vector3();

// A label's picture: its material's map's canvas.
const imageOf = (sprite: Sprite): BadgeImage | null =>
  (sprite.material.map?.image as BadgeImage | undefined) ?? null;

/** The badges in `root` to draw: every sprite on `BADGE_LAYER` shown, in a part shown, its material shown. */
export const badgeSprites = (root: Object3D): Sprite[] => {
  const sprites: Sprite[] = [];

  root.traverseVisible((object) => {
    if (
      object instanceof Sprite &&
      object.layers.isEnabled(BADGE_LAYER) &&
      object.material.visible
    ) {
      sprites.push(object);
    }
  });

  return sprites;
};

/**
 * `sprites` (`badgeSprites`) to draw as `camera` sees them, in the order three.js would draw them as sprites of their
 *  own: far before near, and in the same place in the order they're given (as each marker's are made: a bar's back
 *  before its front, its flag, its label). `cellOf` says where each one's picture is in the atlas (`BadgeAtlas#plain`
 *  for one with none): one whose picture isn't there isn't drawn. The world's matrices as they are: the caller works
 *  them out first.
 */
export const badgeInstances = (
  sprites: readonly Sprite[],
  camera: Camera,
  cellOf: (image: BadgeImage | null) => Cell | null
): BadgeInstance[] =>
  sprites
    .map((sprite, index) => ({
      sprite,
      index,
      // Along the camera's view, more negative the further away.
      depth: position
        .setFromMatrixPosition(sprite.matrixWorld)
        .applyMatrix4(camera.matrixWorldInverse).z,
    }))
    .sort((a, b) => a.depth - b.depth || a.index - b.index)
    .flatMap(({ sprite }): BadgeInstance[] => {
      const cell = cellOf(imageOf(sprite));

      if (cell === null) {
        return [];
      }

      const { elements } = sprite.matrixWorld,
        { color, opacity } = sprite.material;

      return [
        {
          at: [elements[12]!, elements[13]!, elements[14]!],
          // Its scale, as three.js has it for a sprite: its matrix's first two columns' lengths.
          size: [
            Math.hypot(elements[0]!, elements[1]!, elements[2]!),
            Math.hypot(elements[4]!, elements[5]!, elements[6]!),
          ],
          centre: [sprite.center.x, sprite.center.y],
          // Its colour as it's worked with, as a sprite's is drawn: not as it's written.
          colour: [color.r, color.g, color.b, opacity],
          cell,
        },
      ];
    });

// How many badges there's room for at first, the room doubling as more are drawn.
const ROOM = 256,
  // How much sooner a badge drawn as a sprite of its own is drawn than the rest: still after the smoke (`water.ts`).
  UNDER = 0.01;

/** The badges, drawn together: add `mesh` to the scene, and `gather` them as each frame is drawn. */
export class Badges {
  readonly atlas = new BadgeAtlas();
  readonly material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      { atlas: { value: null } },
    ]),
    vertexShader,
    fragmentShader,
    fog: true,
    transparent: true,
    // Over all, as each sprite was.
    depthTest: false,
    depthWrite: false,
  });
  readonly mesh: Mesh;
  #quad = new PlaneGeometry(1, 1);
  #room = 0;

  constructor(order: number) {
    this.mesh = new Mesh(this.#geometry(ROOM), this.material);
    this.mesh.renderOrder = order;
    // Its quads are placed in the shader: three.js can't tell where they are.
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  /**
   * Draws the badges in `root` (`badgeSprites`) as `camera` sees them, their pictures in the atlas. One whose picture
   *  doesn't fit in it is drawn as a sprite of its own, on the camera's layer too, under the rest, till it does. The
   *  world's matrices as they are: the caller works them out first.
   */
  gather(root: Object3D, camera: Camera): number {
    return this.draw(badgeSprites(root), camera);
  }

  /** Draws `sprites` (`badgeSprites`) as `gather` draws those it finds: how many. */
  draw(sprites: readonly Sprite[], camera: Camera): number {
    this.atlas.hold(
      sprites.flatMap((sprite) => {
        const image = imageOf(sprite);

        return image === null ? [] : [image];
      })
    );

    sprites.forEach((sprite) => {
      const image = imageOf(sprite),
        held = image === null || this.atlas.cellOf(image) !== null;

      if (held) {
        sprite.layers.disable(0);
      } else {
        sprite.layers.enable(0);
      }

      // Under the rest, whatever its depth: three.js sorts the batch by its own place, not its badges'.
      sprite.renderOrder = held
        ? this.mesh.renderOrder
        : this.mesh.renderOrder - UNDER;
    });

    const badges = badgeInstances(sprites, camera, (image) =>
      image === null ? this.atlas.plain : this.atlas.cellOf(image)
    );

    this.material.uniforms['atlas']!.value = this.atlas.texture;
    this.#fill(badges);

    return badges.length;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.#quad.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }

  // An instanced quad with room for `room` badges.
  #geometry(room: number): InstancedBufferGeometry {
    const geometry = new InstancedBufferGeometry();

    geometry.index = this.#quad.index;
    geometry.setAttribute('position', this.#quad.getAttribute('position'));
    geometry.setAttribute('uv', this.#quad.getAttribute('uv'));
    (
      [
        ['anchor', 3],
        ['size', 2],
        ['centre', 2],
        ['colour', 4],
        ['cell', 4],
      ] as const
    ).forEach(([name, width]) =>
      geometry.setAttribute(
        name,
        // Written afresh as each frame's drawn.
        new InstancedBufferAttribute(
          new Float32Array(room * width),
          width
        ).setUsage(DynamicDrawUsage)
      )
    );
    geometry.instanceCount = 0;
    this.#room = room;

    return geometry;
  }

  // The instances, made room for.
  #fill(badges: readonly BadgeInstance[]): void {
    if (badges.length > this.#room) {
      let room = this.#room;

      while (room < badges.length) {
        room *= 2;
      }

      this.mesh.geometry.dispose();
      this.mesh.geometry = this.#geometry(room);
    }

    const geometry = this.mesh.geometry as InstancedBufferGeometry,
      attribute = (name: string): InstancedBufferAttribute =>
        geometry.getAttribute(name) as InstancedBufferAttribute,
      anchor = attribute('anchor'),
      size = attribute('size'),
      centre = attribute('centre'),
      colour = attribute('colour'),
      cell = attribute('cell');

    badges.forEach((badge, index) => {
      (anchor.array as Float32Array).set(badge.at, index * 3);
      (size.array as Float32Array).set(badge.size, index * 2);
      (centre.array as Float32Array).set(badge.centre, index * 2);
      (colour.array as Float32Array).set(badge.colour, index * 4);
      (cell.array as Float32Array).set(badge.cell, index * 4);
    });

    // Sent again as far as they're drawn.
    [anchor, size, centre, colour, cell].forEach((changed) => {
      changed.clearUpdateRanges();

      if (badges.length > 0) {
        changed.addUpdateRange(0, badges.length * changed.itemSize);
        changed.needsUpdate = true;
      }
    });
    geometry.instanceCount = badges.length;
  }
}

export default Badges;
