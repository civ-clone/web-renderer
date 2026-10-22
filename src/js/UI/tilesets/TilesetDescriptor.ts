import { TopologyId, topologyIds } from '@civ-clone/core-world/topologies';

// What a tileset says about itself (#56, #92): the grid it is drawn for, its native tile size, the map scales it can be
//  shown at, the sprites it has, how the sprites for each kind of thing are named and put together, and how player
//  colours go onto units and cities. Every pack has one, so the renderer can draw a pack it has never seen without code
//  changes. It is plain JSON, so a pack that arrives at runtime can bring its own.
//
// Sprite names leave out the store's prefix and extension (`terrain/hills_nes`, not `./assets/terrain/hills_nes.png`),
//  as the renderer asks for them. Sizes and offsets are in the pack's native pixels; the renderer multiplies them by
//  the map scale.

/** The one descriptor format this renderer reads. Any other number is refused, so a newer pack is not half-drawn. */
export const TILESET_SCHEMA = 1;

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface TilesetGeometry {
  /** How far apart, in native px, neighbouring columns and rows of tiles are. */
  columnStep: number;
  rowStep: number;
  /** How far odd rows are pushed across, for staggered and hex grids. */
  oddRowShift: number;
  /** Where a tile-sized sprite's top-left corner goes in the tile. */
  anchor: Point;
  /** How far tall sprites reach out of their tile, for the layers to leave room for (#91). */
  overhang: { top: number; right: number; bottom: number; left: number };
}

/**
 * Which neighbours a family looks at: `edges` are the ones sharing an edge, `all` every neighbour. The direction
 * names come from the world's topology (#92).
 */
export type Neighbours = 'edges' | 'all';

/**
 * How a family's sprites are put together:
 * - `bitmask`: one whole-tile sprite per combination of matching neighbours (Civ1's `hills_nes`);
 * - `corners`: four quarter-tile sprites, each picked by the neighbours touching that corner (coasts);
 * - `edges`: one overlay per matching neighbour (roads, river mouths, fog);
 * - `dither`: blended through a mask.
 */
export type TransitionMethod = 'bitmask' | 'corners' | 'edges' | 'dither';

/** A family drawn from one sprite, or one per neighbour or combination of neighbours. */
export interface SpriteFamily {
  method?: TransitionMethod;
  neighbours?: Neighbours;
  /** The sprite's name, with `{placeholders}` filled from engine names and directions. */
  sprite: string;
  /** What is drawn with no matching neighbour: a sprite, or a square of colour `size` px across in the middle. */
  isolated?: string | { dot: string; size: number };
  /** How the directions in `{dirs}` are written together: `""` gives `nes`, `"-"` gives `ne-sw`. */
  join?: string;
  /** Terrain this family is not drawn on. */
  skip?: string[];
  /** For each terrain, what counts as a match beside it when not the same terrain; `@water` is any water. */
  matches?: { [terrain: string]: string[] };
  /** Where sprites smaller than a tile go in it, by engine name. */
  anchors?: { [name: string]: Point };
}

/** Civ1's coast: one strip of `cell`-wide columns, each two `quarter`-sized corners across and down. */
export interface CoastStrip {
  sprite: string;
  cell: number;
  quarter: number;
}

export interface CornersFamily {
  method: 'corners';
  neighbours: Neighbours;
  strip?: CoastStrip;
  /** Quarter sprites by name, for packs that slice them (`terrain/coast/{corner}-{bits}`). */
  sprite?: string;
  corners?: string[];
  /** The order of the neighbours in the bitmask, least significant first. */
  order?: string[];
}

export interface TilesetFamilies {
  base: { land: string; ocean: string };
  terrain: SpriteFamily;
  coast: CornersFamily;
  riverMouth: SpriteFamily;
  irrigation: SpriteFamily;
  mine: SpriteFamily;
  pollution: SpriteFamily;
  road: SpriteFamily;
  railroad: SpriteFamily;
  fog: SpriteFamily;
  special: SpriteFamily;
  hut: SpriteFamily;
}

/**
 * How player colours go on: Civ1 swaps the sprite's `keys` colours for the player's; other packs draw a separate
 * sprite in the player's colour over it (`overlay`).
 */
export type Colouring =
  | { mode: 'replaceColours'; keys: string[] }
  | { mode: 'overlay'; sprite: string; key: string; anchor: Point | 'sprite' };

/** A label written over a tile: across at `x` of the tile, on a baseline at `baseline` of it, `fontSize` native px. */
export interface Label {
  x: number;
  baseline: number;
  fontSize: number;
}

export interface TilesetUnits {
  sprite: string;
  colouring: Colouring;
  fortified: string;
  /** Where the copy that shows a stack is drawn, from the unit. */
  stackOffset: Point;
  /** The busy unit's letter. */
  status: Label;
}

export interface TilesetCities {
  /** `box`: Civ1's sprite in a box of the player's colour; `styles`: a sprite per style, size and walls. */
  mode: 'box' | 'styles';
  sprite: string;
  inset?: number;
  /** The box's colour when the city has units in it. */
  occupied?: string;
  colouring: Colouring;
  labels: {
    x: number;
    sizeBaseline: number;
    nameBaseline: number;
    fontSize: number;
    disorderIcon: Point;
  };
}

export interface TilesetDescriptor {
  schema: typeof TILESET_SCHEMA;
  kind: 'tileset';
  id: string;
  name: string;
  /** The grid it is drawn for, as the engine names it: a game on any other grid cannot use it. */
  grid: TopologyId;
  /** One tile's footprint, in native px. */
  tile: Size;
  geometry: TilesetGeometry;
  /** The map scales it can be shown at, and the one a player starts on. */
  scales: number[];
  defaultScale: number;
  /** Where its sprites are kept: see `spriteKey`. */
  storage: { prefix: string; ext: string };
  /** The tileset a missing optional sprite may come from. */
  fallback: string | null;
  assets: {
    /** Without every one of these it is not installed. */
    required: string[];
    /** Drawn when there, skipped (or taken from `fallback`) when not. */
    optional: string[];
    /** Name prefixes that are the interface's art rather than the map's. */
    ui: string[];
  };
  /** Engine names to the words in sprite names, where they are not just the lower-cased name. */
  names: {
    terrain: { [name: string]: string };
    special: { [terrainAndFeature: string]: string };
    unit: { [name: string]: string };
  };
  families: TilesetFamilies;
  units: TilesetUnits;
  cities: TilesetCities;
}

const isObject = (value: unknown): value is { [key: string]: unknown } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isWholeNumber = (value: unknown, minimum: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= minimum;

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * `json` as a tileset descriptor, once it is one this renderer can draw from: the schema it reads, a grid the engine
 * knows, whole-pixel sizes, scales it can be shown at, and the lists of sprites it has. Throws an `Error` saying what
 * is wrong otherwise.
 */
export const validateDescriptor = (json: unknown): TilesetDescriptor => {
  if (!isObject(json)) {
    throw new Error('A tileset descriptor must be an object.');
  }

  const name =
      typeof json.id === 'string' && json.id !== ''
        ? `"${json.id}"`
        : 'descriptor',
    refuse = (problem: string): never => {
      throw new Error(`Tileset ${name}: ${problem}`);
    };

  if (json.schema !== TILESET_SCHEMA) {
    refuse(
      `schema ${JSON.stringify(
        json.schema
      )} cannot be read here, only schema ${TILESET_SCHEMA}. A newer civ.one may read it.`
    );
  }

  if (json.kind !== 'tileset') {
    refuse(`kind must be "tileset", not ${JSON.stringify(json.kind)}.`);
  }

  if (typeof json.id !== 'string' || json.id === '') {
    refuse('id must be a non-empty string.');
  }

  if (typeof json.name !== 'string' || json.name === '') {
    refuse('name must be a non-empty string.');
  }

  if (!(topologyIds as readonly unknown[]).includes(json.grid)) {
    refuse(
      `grid ${JSON.stringify(json.grid)} is not one of ${topologyIds.join(
        ', '
      )}.`
    );
  }

  const tile = json.tile;

  if (
    !isObject(tile) ||
    !isWholeNumber(tile.width, 1) ||
    !isWholeNumber(tile.height, 1)
  ) {
    refuse('tile must have a whole width and height of at least 1 px.');
  }

  const geometry = json.geometry;

  if (
    !isObject(geometry) ||
    !isWholeNumber(geometry.columnStep, 1) ||
    !isWholeNumber(geometry.rowStep, 1) ||
    !isWholeNumber(geometry.oddRowShift, 0) ||
    !isObject(geometry.anchor) ||
    !isObject(geometry.overhang)
  ) {
    refuse(
      'geometry must have whole column and row steps of at least 1 px, an odd row shift, an anchor and an overhang.'
    );
  }

  const { anchor, overhang } = geometry as {
    [key: string]: { [key: string]: unknown };
  };

  if (!Number.isInteger(anchor.x) || !Number.isInteger(anchor.y)) {
    refuse('geometry.anchor must have a whole x and y in px.');
  }

  if (
    !(['top', 'right', 'bottom', 'left'] as const).every((side) =>
      isWholeNumber(overhang[side], 0)
    )
  ) {
    refuse(
      'geometry.overhang must have a whole top, right, bottom and left of 0 px or more.'
    );
  }

  const scales = json.scales;

  if (
    !Array.isArray(scales) ||
    scales.length === 0 ||
    !scales.every((scale) => isWholeNumber(scale, 1))
  ) {
    refuse('scales must list at least one whole scale of 1 or more.');
  }

  if (!(scales as unknown[]).includes(json.defaultScale)) {
    refuse(
      `defaultScale ${JSON.stringify(json.defaultScale)} is not in scales.`
    );
  }

  const storage = json.storage;

  if (
    !isObject(storage) ||
    typeof storage.prefix !== 'string' ||
    typeof storage.ext !== 'string'
  ) {
    refuse('storage must have a prefix and an ext.');
  }

  if (json.fallback !== null && typeof json.fallback !== 'string') {
    refuse('fallback must be a tileset id or null.');
  }

  const assets = json.assets;

  if (
    !isObject(assets) ||
    !isStringList(assets.required) ||
    !isStringList(assets.optional) ||
    !isStringList(assets.ui)
  ) {
    refuse('assets must list its required, optional and ui sprites.');
  }

  const { required, optional } = assets as { [key: string]: string[] };

  if (required.length === 0) {
    refuse('assets.required must list at least one sprite.');
  }

  const seen = new Set<string>();

  [...required, ...optional].forEach((sprite) => {
    if (sprite === '') {
      refuse('assets lists an empty sprite name.');
    }

    if (seen.has(sprite)) {
      refuse(`assets lists "${sprite}" more than once.`);
    }

    seen.add(sprite);
  });

  (['names', 'families', 'units', 'cities'] as const).forEach((section) => {
    if (!isObject(json[section])) {
      refuse(`${section} must be an object.`);
    }
  });

  // What the map reads as it draws, checked here so a broken pack is refused rather than drawn wrong.
  const { families, units, cities } = json as {
      [section: string]: { [key: string]: unknown };
    },
    fontSize = (label: unknown): unknown =>
      isObject(label) ? label.fontSize : undefined;

  if (!isWholeNumber(fontSize(units.status), 1)) {
    refuse('units.status.fontSize must be a whole number of px, 1 or more.');
  }

  if (!isWholeNumber(fontSize(cities.labels), 1)) {
    refuse('cities.labels.fontSize must be a whole number of px, 1 or more.');
  }

  const coast = families.coast;

  if (!isObject(coast) || coast.method !== 'corners') {
    refuse('families.coast must be a corners family.');
  }

  const { strip } = coast as { strip?: unknown };

  // Named quarter sprites are typed for other packs, but only a coast cut from one strip can be drawn yet (#92).
  if (!isObject(strip)) {
    refuse(
      'families.coast must have a strip: only a coast cut from one strip can be drawn yet.'
    );
  }

  const { sprite, cell, quarter } = strip as { [key: string]: unknown };

  if (typeof sprite !== 'string' || sprite === '') {
    refuse('families.coast.strip.sprite must name a sprite.');
  }

  if (!isWholeNumber(quarter, 1)) {
    refuse(
      'families.coast.strip.quarter must be a whole number of px, 1 or more.'
    );
  }

  // A coast tile is two quarters across, and the strip's columns are tiles side by side.
  if (cell !== (quarter as number) * 2) {
    refuse(
      `families.coast.strip.cell must be two quarters, ${
        (quarter as number) * 2
      } px, not ${JSON.stringify(cell)}.`
    );
  }

  return json as unknown as TilesetDescriptor;
};

/**
 * `template` with each `{placeholder}` replaced from `values`: `expandName('terrain/{terrain}_{dirs}', { terrain:
 * 'hills', dirs: 'nes' })` is `terrain/hills_nes`. Throws for a placeholder with no value, so a family whose names
 * cannot be made is found rather than drawn as a hole.
 */
export const expandName = (
  template: string,
  values: { [placeholder: string]: string }
): string =>
  template.replace(/\{([a-z]+)\}/gi, (match, placeholder: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, placeholder)) {
      throw new Error(`No value for ${match} in "${template}".`);
    }

    return values[placeholder];
  });

/**
 * Where `tileset` keeps the sprite it calls `name`: `prefix + name + ext`, the record's `name` in the asset store and
 * the `data-path` of its image in the preload container. Civ1's `terrain/land` is `./assets/terrain/land.png`, as the
 * import has always stored it, so nobody imports again. Another pack keeps its sprites under a prefix of its own,
 * `./assets/<id>/`, so the same name in two packs is two keys. Sprites are only ever looked up by this whole key.
 */
export const spriteKey = (
  { storage: { prefix, ext } }: TilesetDescriptor,
  name: string
): string => `${prefix}${name}${ext}`;

export default validateDescriptor;
