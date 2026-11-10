import {
  TopologyId,
  createTopology,
  topologyIds,
} from '@civ-clone/core-world/topologies';
import firstFailure, { pathName } from '../lib/jsonSchema';
import schema from './tileset.schema.json';

// What a tileset says about itself (#56, #92): the grid it is drawn for, its native tile size, the map scales it can be
//  shown at, the sprites it has, how the sprites for each kind of thing are named and put together, and how player
//  colours go onto units and cities. Every pack has one, so the renderer can draw a pack it has never seen without code
//  changes. It is plain JSON, so a pack that arrives at runtime can bring its own.
//
// Sprite names leave out the store's prefix and extension (`terrain/hills_nes`, not `./assets/terrain/hills_nes.png`),
//  as the renderer asks for them. Sizes and offsets are in the pack's native pixels; the renderer multiplies them by
//  the map scale.
//
// `tileset.schema.json` describes the JSON, field by field, for pack authors and their editors as well as for
//  `validateDescriptor`, which checks it first and then what a schema cannot say.

/**
 * The one descriptor format this renderer reads, the schema's `schema` too. Any other number is refused, so a newer
 * pack is not half-drawn.
 */
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
  /** Drawn over the terrain instead of under it: irrigation, for a tileset whose terrain covers the land. */
  overTerrain?: boolean;
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
  order: string[];
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
 * How player colours go on: Civ1 swaps the sprite's `keys` colours for the player's (`colours` says which of the
 * player's colours replaces each key, by index: 0, 1, … in order unless it says otherwise); other packs draw a
 * separate sprite in the player's colour over it (`overlay`).
 */
export type Colouring =
  | { mode: 'replaceColours'; keys: string[]; colours?: number[] }
  | { mode: 'overlay'; sprite: string; key: string; anchor: Point | 'sprite' };

/**
 * A label written over a tile: across at `x` of the tile, on a baseline at `baseline` of it, `fontSize` native px. The
 * parts are of the tile's width, which is its height while every tileset's tiles are square (#94/#97).
 */
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
  /**
   * `box`: Civ1's sprite in a box of the player's first colour, `inset` px in from the tile, on a box of `occupied`
   * when the city has units in it; `styles`: a sprite per style, size and walls.
   */
  mode: 'box' | 'styles';
  sprite: string;
  inset: number;
  /** The box's colour when the city has units in it. */
  occupied: string;
  colouring: Colouring;
  /**
   * Where a city's size and name go: across at `x` of the tile (within it), on baselines at those parts of it, and the
   * unhappy citizen in place of the size at `disorderIcon` native px from its corner (within it).
   */
  labels: {
    x: number;
    sizeBaseline: number;
    nameBaseline: number;
    fontSize: number;
    disorderIcon: Point;
  };
}

/**
 * The sizes the interface shows the tileset's sprites at outside the map, in CSS px (#729): a yield's icon, a citizen
 * (`step` apart, so they overlap where `step` is less than `width`) and the cursor. Each sprite is enlarged a whole
 * number of times to at least this width, then CSS shows it at this size; except the cursor, which CSS cannot resize, so
 * is shown at the enlarged size (Civ1's 13px torch at 26).
 */
export interface TilesetUi {
  icon: number;
  citizen: { width: number; step: number };
  cursor: number;
}

/** Civ1's sizes, its 7px icons, 8px citizens and 13px torch doubled: what a tileset without `ui` is shown at. */
export const defaultUi: TilesetUi = {
  icon: 14,
  citizen: { width: 16, step: 12 },
  cursor: 26,
};

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
  /** Optional in the JSON: `validateDescriptor` fills in Civ1's sizes for any it leaves out. */
  ui: TilesetUi;
}

// The placeholders the map fills in each map family's names besides the directions (`{dir}` for `edges`, `{dirs}` for
//  `bitmask`): the families it draws with `drawFamily`, besides the base and the coast.
const familyValues: { [key in keyof TilesetFamilies]?: string[] } = {
  terrain: ['terrain'],
  riverMouth: [],
  road: [],
  railroad: [],
  fog: [],
  irrigation: [],
  mine: [],
  pollution: [],
  special: ['special'],
  hut: [],
};

/** The placeholders in a sprite name: `terrain/{terrain}_{dirs}` has `terrain` and `dirs`. */
const placeholders = (template: string): string[] =>
  Array.from(template.matchAll(/\{([a-z]+)\}/gi), ([, name]) => name);

const listed = (names: string[]): string =>
  names.length > 0 ? `{${names.join('}, {')}}` : 'none';

/**
 * `json` as a tileset descriptor, once it is one this renderer can draw from: one `tileset.schema.json` accepts (the
 * schema it reads, whole-pixel sizes, the lists of sprites it has, families the map can put together), whose grid the
 * engine knows, whose names have only the placeholders the map fills, and whose sizes agree. Throws an `Error` saying
 * what is wrong otherwise.
 */
export const validateDescriptor = (json: unknown): TilesetDescriptor => {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('A tileset descriptor must be an object.');
  }

  const id = (json as { id?: unknown }).id,
    name = typeof id === 'string' && id !== '' ? `"${id}"` : 'descriptor',
    refuse = (problem: string): never => {
      throw new Error(`Tileset ${name}: ${problem}`);
    },
    // The topology's names for a square tile's eight neighbours, as the coast's bitmask has them.
    squareDirections = createTopology('square', 2, 2).directions(),
    failure = firstFailure(schema, json);

  // What a schema can say, in its own words: see `x-message` in the schema.
  if (failure !== null) {
    const { path, value, keyword, message } = failure,
      tokens: { [token: string]: string } = {
        path: pathName(path),
        parent: pathName(path.slice(0, -1)),
        value: `${JSON.stringify(value)}`,
        grids: topologyIds.join(', '),
        directions: squareDirections.join(', '),
        keyword,
      };

    refuse(
      (
        message ?? '{path} is not what a tileset has there ({keyword}).'
      ).replace(
        /\{(path|parent|value|grids|directions|keyword)\}/g,
        (_, token: string) => tokens[token]
      )
    );
  }

  // And what it can't: the engine's names, the placeholders the map fills, and sizes that agree with each other.
  const descriptor = json as TilesetDescriptor,
    { grid, scales, defaultScale, assets, families, units, cities, tile } =
      descriptor,
    { strip, order } = families.coast as CornersFamily & { strip: CoastStrip };

  if (!(topologyIds as readonly string[]).includes(grid)) {
    refuse(
      `grid ${JSON.stringify(grid)} is not one of ${topologyIds.join(', ')}.`
    );
  }

  if (!scales.includes(defaultScale)) {
    refuse(`defaultScale ${defaultScale} is not in scales.`);
  }

  const seen = new Set<string>();

  [...assets.required, ...assets.optional].forEach((sprite) => {
    if (seen.has(sprite)) {
      refuse(`assets lists "${sprite}" more than once.`);
    }

    seen.add(sprite);
  });

  // A coast tile is two quarters across, and the strip's columns are tiles side by side.
  if (strip.cell !== strip.quarter * 2) {
    refuse(
      `families.coast.strip.cell must be two quarters, ${
        strip.quarter * 2
      } px, not ${JSON.stringify(strip.cell)}.`
    );
  }

  // The coast's bitmask has one bit per neighbour, and a strip's columns are cut for a square tile's eight (Civ1's),
  //  so the order names each of those once. Coasts for other grids come with their packs (#94/#97).
  if (
    order.length !== squareDirections.length ||
    !squareDirections.every((direction) => order.includes(direction))
  ) {
    refuse(
      `families.coast.order must list each of a square tile's eight neighbours (${squareDirections.join(
        ', '
      )}) once, as a coast strip is cut for them.`
    );
  }

  // The map fills only the placeholders it has for a name, so a name with any other is refused here rather than
  //  failing on every tile.
  const fills = (where: string, template: string, given: string[]): void => {
    const unknown = placeholders(template).filter(
      (placeholder) => !given.includes(placeholder)
    );

    if (unknown.length > 0) {
      refuse(
        `${where} has ${listed(unknown)}, but the map fills ${
          given.length > 0 ? `only ${listed(given)}` : 'none'
        } here.`
      );
    }
  };

  (Object.entries(familyValues) as [keyof TilesetFamilies, string[]][]).forEach(
    ([key, values]) => {
      const { method, sprite, isolated } = families[key] as SpriteFamily;

      fills(`families.${key}.sprite`, sprite, [
        ...values,
        ...(method === 'bitmask'
          ? ['dirs']
          : method === 'edges'
          ? ['dir']
          : []),
      ]);

      if (
        typeof isolated === 'string' &&
        placeholders(isolated).some(
          (placeholder) => !values.includes(placeholder)
        )
      ) {
        refuse(
          `families.${key}.isolated must name a sprite with no placeholders but ${listed(
            values
          )}.`
        );
      }
    }
  );

  fills('units.sprite', units.sprite, ['unit']);
  fills('units.fortified', units.fortified, []);
  fills('cities.sprite', cities.sprite, []);

  (['units', 'cities'] as const).forEach((section) => {
    const { keys, colours } = descriptor[section].colouring as {
      keys: string[];
      colours?: number[];
    };

    if (colours !== undefined && colours.length !== keys.length) {
      refuse(
        `${section}.colouring.colours must give a player's colour, by whole index, for each key.`
      );
    }
  });

  const icon = cities.labels.disorderIcon;

  if (icon.x >= tile.width || icon.y >= tile.height) {
    refuse(
      'cities.labels.disorderIcon must have a whole x and y in px, within the tile.'
    );
  }

  // Civ1's size for each one `ui` leaves out, all of them when there is none. A new object each time, so no two
  //  tilesets share one.
  const ui: Partial<Omit<TilesetUi, 'citizen'>> & {
    citizen?: Partial<TilesetUi['citizen']>;
  } = descriptor.ui ?? {};

  return {
    ...descriptor,
    ui: {
      icon: ui.icon ?? defaultUi.icon,
      citizen: {
        width: ui.citizen?.width ?? defaultUi.citizen.width,
        step: ui.citizen?.step ?? defaultUi.citizen.step,
      },
      cursor: ui.cursor ?? defaultUi.cursor,
    },
  };
};

// Each template split once into its text and its placeholders, `['terrain/', 'terrain', '_', 'dirs', '']`: the map
//  names a sprite this way for every one it draws, and a regular expression each time cost several times the draw.
//  Keyed by the descriptors' own templates, a few dozen of them, so it stays small: never pass it a name built at
//  draw time.
const templateParts = new Map<string, string[]>();

/**
 * `template` with each `{placeholder}` replaced from `values`: `expandName('terrain/{terrain}_{dirs}', { terrain:
 * 'hills', dirs: 'nes' })` is `terrain/hills_nes`. Throws for a placeholder with no value, so a family whose names
 * cannot be made is found rather than drawn as a hole.
 */
export const expandName = (
  template: string,
  values: { [placeholder: string]: string }
): string => {
  let parts = templateParts.get(template);

  if (parts === undefined) {
    parts = template.split(/\{([a-z]+)\}/i);
    templateParts.set(template, parts);
  }

  let name = parts[0];

  for (let i = 1; i < parts.length; i += 2) {
    const placeholder = parts[i];

    if (!Object.prototype.hasOwnProperty.call(values, placeholder)) {
      throw new Error(`No value for {${placeholder}} in "${template}".`);
    }

    name += values[placeholder] + parts[i + 1];
  }

  return name;
};

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
