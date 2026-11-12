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
//  `readDescriptor`, which checks it first and then what a schema cannot say. The format says more than the map draws
//  yet (Civ2's shields and city styles, #152): `validateDescriptor` refuses those, saying which.

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

/**
 * Where something goes: a point in native px, or the name of an anchor the pack's sprite metadata gives each sprite
 * (`SpriteAnchors`), such as `"shield"` for the shield on each of Civ2's units, which sits somewhere different on each.
 */
export type Anchor = Point | string;

/**
 * The anchors a pack's sprites carry, by sprite name and then anchor name: `{ "units/settlers": { "shield": { x: 12,
 * y: 12 } } }`. They come with the pack's sprites (the Civ2 extractor's `metadata.json`, read from marker pixels in the
 * player's own copy), not with its descriptor, which names them only.
 */
export interface SpriteAnchors {
  [sprite: string]: { [anchor: string]: Point };
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

/**
 * One of a coast's quarter sprites, for a pack that has them by name: where its top-left corner goes in the tile, and
 * the neighbours it is picked by, in the order its name gives them.
 */
export interface CoastCorner {
  at: Point;
  neighbours: string[];
}

/**
 * A coast, in quarters each picked by the neighbours touching it: cut from one `strip` with the neighbours in `order`
 * (Civ1's), or named quarter sprites, `sprite` filled with each of `corners`' names as `{corner}` and one digit per
 * neighbour as `{bits}`, `1` for land, in the corner's order (Civ2's `terrain/coast/n-011`, the top quarter with land
 * to the N and NE of the three it touches, NW, N and NE). A coast has one or the other.
 */
export interface CornersFamily {
  method: 'corners';
  neighbours: Neighbours;
  strip?: CoastStrip;
  /** The order of a strip's neighbours in the bitmask, least significant first. */
  order?: string[];
  sprite?: string;
  corners?: { [corner: string]: CoastCorner };
}

/**
 * The sprites under everything. `land` may have `{terrain}`, for a sprite per terrain (Civ2's) rather than one under
 * all land (Civ1's); `under` then says, for a terrain drawn over another one's base, whose: Civ2 draws its forest,
 * hills and mountains over grassland, and has no river terrain, only the river over grassland.
 */
export interface BaseFamily {
  land: string;
  ocean: string;
  under?: { [terrain: string]: string };
}

export interface TilesetFamilies {
  base: BaseFamily;
  terrain: SpriteFamily;
  coast: CornersFamily;
  riverMouth: SpriteFamily;
  irrigation: SpriteFamily;
  mine: SpriteFamily;
  pollution: SpriteFamily;
  road: SpriteFamily;
  railroad: SpriteFamily;
  /** Left out, the edge of what a player has seen is drawn without one (Civ2 has none). */
  fog?: SpriteFamily;
  special: SpriteFamily;
  hut: SpriteFamily;
}

/**
 * How player colours go on: Civ1 swaps the sprite's `keys` colours for the player's (`colours` says which of the
 * player's colours replaces each key, by index: 0, 1, … in order unless it says otherwise); other packs draw a
 * separate sprite over it, its own `keys` swapped the same way, with its top-left corner at `anchor` on the sprite
 * (`overlay`: Civ2's shield). A unit in a stack has `stack.sprite` drawn behind that, `stack.offset` from it.
 */
export type Colouring =
  | { mode: 'replaceColours'; keys: string[]; colours?: number[] }
  | {
      mode: 'overlay';
      sprite: string;
      keys: string[];
      colours?: number[];
      anchor: Anchor;
      stack?: { sprite: string; offset: Point };
    };

/**
 * A label written over a tile: across at `x` of the tile, on a baseline at `baseline` of it, `fontSize` native px. The
 * `x` is a part of the tile's width and `baseline` a part of its height (#97).
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
  /**
   * Where a unit's sprite (and `fortified`) has its top-left corner, from the tile's: above it for a sprite taller than
   * the tile (Civ2's 64 × 48 on 64 × 32). `{ x: 0, y: 0 }` when left out.
   */
  anchor?: Point;
  /**
   * Where the copy that shows a stack is drawn, from the unit (Civ1's). Left out, a stack is shown by the colouring's
   * `stack` alone.
   */
  stackOffset?: Point;
  /** The busy unit's letter. */
  status: Label;
}

/**
 * A sprite per style, size and walls, for `styles` cities: `{style}` is the city's civilization's style, `{size}` its
 * size's bucket (0, 1, …), `{walls}` the word for with or without walls.
 */
export interface CityStyles {
  /** The words `{style}` can be. */
  names: string[];
  /** The style of a civilization `civilizations` leaves out. */
  default: string;
  /** By civilization, as the engine names it. */
  civilizations: { [civilization: string]: string };
  /**
   * The city size each bucket starts at, in order: a city is in the last bucket whose size it has reached, the first
   * when it has reached none. `[1, 4, 8, 12]` gives sizes 1-3 bucket 0 and 12 and over bucket 3.
   */
  sizes: number[];
  walls: { plain: string; walled: string };
}

export interface TilesetCities {
  /**
   * `box`: Civ1's sprite in a box of the player's first colour, `inset` px in from the tile, on a box of `occupied`
   * when the city has units in it, its `colouring` swapped for the player's; `styles`: a sprite per style, size and
   * walls (`styles`), with the player's flag drawn over it by an `overlay` colouring (Civ2's `city/flag`, its keys
   * swapped for the player's colours, at each city sprite's own `flag` anchor).
   */
  mode: 'box' | 'styles';
  sprite: string;
  /** For `box` cities. */
  inset?: number;
  /** The box's colour when the city has units in it, for `box` cities. */
  occupied?: string;
  /** Any for `box` cities; an `overlay`, the flag, for `styles` cities. */
  colouring: Colouring;
  /** For `styles` cities. */
  styles?: CityStyles;
  /** Where the sprite has its top-left corner, from the tile's, as for units. `{ x: 0, y: 0 }` when left out. */
  anchor?: Point;
  /**
   * Where a city's size and name go: across at `x` of the tile (within it), on baselines at those parts of it, and the
   * unhappy citizen in place of the size at `disorderIcon` native px from its corner (within it). A sprite whose size
   * goes somewhere of its own has `size`, which the size is written at in place of `x` and `sizeBaseline`.
   */
  labels: {
    x: number;
    sizeBaseline: number;
    nameBaseline: number;
    fontSize: number;
    disorderIcon: Point;
    size?: Anchor;
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
  /**
   * The tileset, by id, that the sprites this one leaves out come from: those under `assets.ui` prefixes it does not
   * have (a map pack with no interface art of its own), and missing optional ones. Not its own id. Nothing looks
   * sprites up there yet.
   */
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
  // The one group always matches.
  Array.from(template.matchAll(/\{([a-z]+)\}/gi), ([, name]) => name!);

const listed = (names: string[]): string =>
  names.length > 0 ? `{${names.join('}, {')}}` : 'none';

// What `refuse` says a descriptor is called: its id, when it has one.
const descriptorName = (json: unknown): string => {
  const id = (json as { id?: unknown }).id;

  return typeof id === 'string' && id !== '' ? `"${id}"` : 'descriptor';
};

const isOrigin = ({ x, y }: Point = { x: 0, y: 0 }): boolean =>
  x === 0 && y === 0;

/**
 * `json` as a tileset descriptor, in the format this renderer reads, whether or not it can draw all of it yet (see
 * `validateDescriptor`): one `tileset.schema.json` accepts (the schema it reads, whole-pixel sizes, the lists of sprites
 * it has, families the map can put together), whose grid the engine knows, whose names have only the placeholders the
 * map fills, and whose sizes agree. Throws an `Error` saying what is wrong otherwise.
 */
export const readDescriptor = (json: unknown): TilesetDescriptor => {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('A tileset descriptor must be an object.');
  }

  const name = descriptorName(json),
    refuse = (problem: string): never => {
      throw new Error(`Tileset ${name}: ${problem}`);
    },
    // The topology's names for a square tile's eight neighbours, as a coast strip's bitmask has them.
    squareDirections = createTopology('square', 2, 2).directions(),
    failure = firstFailure(schema, json);

  // What a schema can say, in its own words: see `x-message` in the schema.
  if (failure !== null) {
    const { path, value, keyword, message } = failure,
      quarter = (json as { families?: { coast?: { strip?: CoastStrip } } })
        .families?.coast?.strip?.quarter,
      tokens: { [token: string]: string } = {
        path: pathName(path),
        parent: pathName(path.slice(0, -1)),
        value: `${JSON.stringify(value)}`,
        grids: topologyIds.join(', '),
        directions: squareDirections.join(', '),
        // The coast strip's cell, as wide as two of its quarters.
        twoQuarters: Number.isInteger(quarter)
          ? `${(quarter as number) * 2} px`
          : 'a whole number of px',
        keyword,
      };

    refuse(
      (
        message ?? '{path} is not what a tileset has there ({keyword}).'
      ).replace(
        /\{(path|parent|value|grids|directions|twoQuarters|keyword)\}/g,
        // Only the tokens named in the pattern, each of which `tokens` has.
        (_, token: string) => tokens[token]!
      )
    );
  }

  // And what it can't: the engine's names, the placeholders the map fills, and sizes that agree with each other.
  const descriptor = json as TilesetDescriptor,
    {
      id,
      grid,
      scales,
      defaultScale,
      fallback,
      assets,
      families,
      units,
      cities,
      tile,
      geometry,
    } = descriptor;

  if (!(topologyIds as readonly string[]).includes(grid)) {
    refuse(
      `grid ${JSON.stringify(grid)} is not one of ${topologyIds.join(', ')}.`
    );
  }

  // Each neighbour's name on the descriptor's own grid, now that the engine knows it.
  const gridDirections = createTopology(grid, 2, 2).directions();

  if (!scales.includes(defaultScale)) {
    refuse(`defaultScale ${defaultScale} is not in scales.`);
  }

  if (fallback === id) {
    refuse(`fallback names the tileset itself: another tileset's id, or null.`);
  }

  const seen = new Set<string>();

  [...assets.required, ...assets.optional].forEach((sprite) => {
    if (seen.has(sprite)) {
      refuse(`assets lists "${sprite}" more than once.`);
    }

    seen.add(sprite);
  });

  // A sprite drawn above or left of its tile reaches out of it, as far as the layers leave room for.
  (['units', 'cities'] as const).forEach((section) => {
    const { x, y } = descriptor[section].anchor ?? { x: 0, y: 0 },
      { top, left } = geometry.overhang;

    if (-y > top || -x > left) {
      refuse(
        `${section}.anchor reaches ${Math.max(
          -y,
          0
        )} px above the tile and ${Math.max(
          -x,
          0
        )} px left of it, but geometry.overhang leaves room for ${top} above and ${left} left.`
      );
    }
  });

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

  const { base, coast } = families;

  fills('families.base.land', base.land, ['terrain']);
  fills('families.base.ocean', base.ocean, []);

  if (base.under !== undefined) {
    if (!placeholders(base.land).includes('terrain')) {
      refuse(
        'families.base.under needs {terrain} in families.base.land: with one land sprite, every terrain is over the same one.'
      );
    }

    // Each terrain is over one with a base of its own: not itself, and not one that is over another in turn.
    Object.entries(base.under).forEach(([terrain, under]) => {
      if (Object.prototype.hasOwnProperty.call(base.under, under)) {
        refuse(
          `families.base.under.${terrain} is ${JSON.stringify(
            under
          )}, which is drawn over another terrain's base itself: name a terrain with a base of its own.`
        );
      }
    });
  }

  // A coast is cut from a strip, or named quarter sprites: one or the other.
  const { strip, order, corners } = coast;

  if (
    strip !== undefined &&
    (corners !== undefined || coast.sprite !== undefined)
  ) {
    refuse(
      `families.coast has a strip and ${
        corners !== undefined ? 'named corners' : 'a quarter sprite'
      }: it must have one or the other.`
    );
  }

  if (strip !== undefined) {
    // A coast tile is two quarters across, and the strip's columns are tiles side by side.
    if (strip.cell !== strip.quarter * 2) {
      refuse(
        `families.coast.strip.cell must be two quarters, ${
          strip.quarter * 2
        } px, not ${JSON.stringify(strip.cell)}.`
      );
    }

    // The coast's bitmask has one bit per neighbour, and a strip's columns are cut for a square tile's eight (Civ1's),
    //  so the order names each of those once.
    if (
      order === undefined ||
      order.length !== squareDirections.length ||
      !squareDirections.every((direction) => order.includes(direction))
    ) {
      refuse(
        `families.coast.order must list each of a square tile's eight neighbours (${squareDirections.join(
          ', '
        )}) once, as a coast strip is cut for them.`
      );
    }
  } else {
    if (coast.sprite === undefined || corners === undefined) {
      refuse(
        'families.coast must have a strip, or a sprite and the corners it is named for.'
      );
    }

    if (order !== undefined) {
      refuse(
        "families.coast.order is for a strip: named corners give each quarter's own neighbours."
      );
    }

    const sprite = coast.sprite!;

    fills('families.coast.sprite', sprite, ['corner', 'bits']);

    if (
      !['corner', 'bits'].every((placeholder) =>
        placeholders(sprite).includes(placeholder)
      )
    ) {
      refuse(
        'families.coast.sprite must have {corner} and {bits}, so that each quarter and each mix of its neighbours has a sprite of its own.'
      );
    }

    if (Object.keys(corners!).length === 0) {
      refuse('families.coast.corners must name at least one corner.');
    }

    Object.entries(corners!).forEach(([corner, { at, neighbours }]) => {
      const where = `families.coast.corners.${corner}`;

      // The corner's neighbours are the descriptor's own grid's, not the square's.
      if (
        neighbours.some((direction) => !gridDirections.includes(direction)) ||
        new Set(neighbours).size !== neighbours.length
      ) {
        refuse(
          `${where}.neighbours must list neighbours on the ${grid} grid (${gridDirections.join(
            ', '
          )}), each once.`
        );
      }

      if (at.x < 0 || at.y < 0 || at.x >= tile.width || at.y >= tile.height) {
        refuse(`${where}.at must be within the tile.`);
      }
    });
  }

  (Object.entries(familyValues) as [keyof TilesetFamilies, string[]][]).forEach(
    ([key, values]) => {
      const family = families[key] as SpriteFamily | undefined;

      // Only fog may be left out: the schema requires the others.
      if (family === undefined) {
        return;
      }

      const { method, sprite, isolated } = family;

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

  // How player colours go on: an overlay's sprites are drawn as they are named.
  const checkColouring = (section: string, colouring: Colouring): void => {
    const { keys, colours } = colouring;

    if (colours !== undefined && colours.length !== keys.length) {
      refuse(
        `${section}.colouring.colours must give a player's colour, by whole index, for each key.`
      );
    }

    if (colouring.mode === 'overlay') {
      if (colouring.sprite === undefined || colouring.anchor === undefined) {
        refuse(
          `${section}.colouring must name the sprite an overlay draws, and its anchor.`
        );
      }

      fills(`${section}.colouring.sprite`, colouring.sprite, []);

      if (colouring.stack !== undefined) {
        fills(`${section}.colouring.stack.sprite`, colouring.stack.sprite, []);
      }

      return;
    }

    (['sprite', 'anchor', 'stack'] as const).forEach((field) => {
      if ((colouring as { [field: string]: unknown })[field] !== undefined) {
        refuse(
          `${section}.colouring.${field} is for an overlay: replaceColours recolours the sprite itself.`
        );
      }
    });
  };

  checkColouring('units', units.colouring);

  // Something shows that a unit is one of a stack: Civ1's copy of it, or Civ2's back-shield.
  if (
    units.stackOffset === undefined &&
    (units.colouring.mode !== 'overlay' || units.colouring.stack === undefined)
  ) {
    refuse(
      "units must show a stack: a stackOffset for a copy of the unit, or an overlay colouring's stack."
    );
  }

  if (
    cities.colouring.mode === 'overlay' &&
    cities.colouring.stack !== undefined
  ) {
    refuse(
      'cities.colouring.stack is for units: a city is never one of a stack.'
    );
  }

  checkColouring('cities', cities.colouring);

  // A city is in a box (Civ1's) or drawn by style (Civ2's): each has its own fields, and not the other's.
  if (cities.mode === 'box') {
    if (cities.inset === undefined) {
      refuse('cities.inset must be a whole number of px, 0 or more.');
    }

    if (cities.occupied === undefined) {
      refuse('cities.occupied must be a colour.');
    }

    if (cities.styles !== undefined) {
      refuse(
        "cities.styles is for styles cities: a box city has one sprite, in its player's colour."
      );
    }

    fills('cities.sprite', cities.sprite, []);
  } else {
    (['inset', 'occupied'] as const).forEach((field) => {
      if (cities[field] !== undefined) {
        refuse(
          `cities.${field} is for box cities: a styles city shows its player by its flag.`
        );
      }
    });

    if (cities.styles === undefined) {
      refuse(
        'cities.styles must say which sprite each civilization, size and walls have.'
      );
    }

    if (cities.colouring.mode !== 'overlay') {
      refuse(
        "cities.colouring must be an overlay for styles cities: the flag, drawn over the city in its player's colours."
      );
    }

    const styles = cities.styles!;

    fills('cities.sprite', cities.sprite, ['style', 'size', 'walls']);

    // Each placeholder that tells two sprites apart is in the name, or they would all be the one sprite.
    (
      [
        ['style', styles.names.length > 1, 'there is more than one style'],
        ['size', styles.sizes.length > 1, 'there is more than one size bucket'],
        [
          'walls',
          styles.walls.plain !== styles.walls.walled,
          'walled cities have a word of their own',
        ],
      ] as const
    ).forEach(([placeholder, needed, why]) => {
      if (needed && !placeholders(cities.sprite).includes(placeholder)) {
        refuse(`cities.sprite must have {${placeholder}}, as ${why}.`);
      }
    });

    if (new Set(styles.names).size !== styles.names.length) {
      refuse('cities.styles.names must list each style once.');
    }

    [
      ['cities.styles.default', styles.default],
      ...Object.entries(styles.civilizations).map(([civilization, style]) => [
        `cities.styles.civilizations.${civilization}`,
        style,
      ]),
    ].forEach(([where, style]) => {
      if (!styles.names.includes(style!)) {
        refuse(
          `${where} ${JSON.stringify(style)} is not one of cities.styles.names.`
        );
      }
    });

    if (
      styles.sizes.some(
        (size, index) => index > 0 && size <= styles.sizes[index - 1]!
      )
    ) {
      refuse(
        'cities.styles.sizes must list the size each bucket starts at, smallest first, each once.'
      );
    }
  }

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

/**
 * What in `descriptor` the map cannot draw yet, said as `validateDescriptor` refuses it, or `null` when it can draw it
 * all. The format says more than the map draws (#152): Civ2's shields and city styles, and sprites taller than their
 * tile. Each goes from this list as the map learns to draw it (Civ2's base per terrain and named coast quarters have).
 */
export const notDrawnYet = ({
  units,
  cities,
}: TilesetDescriptor): string | null => {
  if (units.stackOffset === undefined) {
    return 'units.stackOffset must be given: a stack shown by its colouring alone cannot be drawn yet.';
  }

  if (units.colouring.mode !== 'replaceColours') {
    return `units.colouring.mode "${units.colouring.mode}" cannot be drawn yet: only replaceColours.`;
  }

  if (cities.mode !== 'box') {
    return `cities.mode "${cities.mode}" cannot be drawn yet: only box.`;
  }

  if (cities.colouring.mode !== 'replaceColours') {
    return `cities.colouring.mode "${cities.colouring.mode}" cannot be drawn yet: only replaceColours.`;
  }

  if (cities.labels.size !== undefined) {
    return 'cities.labels.size cannot be drawn yet: only x and sizeBaseline.';
  }

  for (const section of ['units', 'cities'] as const) {
    if (!isOrigin({ units, cities }[section].anchor)) {
      return `${section}.anchor cannot be drawn yet: only a sprite at the tile's top-left corner.`;
    }
  }

  return null;
};

/**
 * `json` as a tileset descriptor, once it is one this renderer can draw from: one `readDescriptor` reads, with nothing
 * `notDrawnYet` names. Throws an `Error` saying what is wrong otherwise. The map, and every layer that casts a
 * colouring to `replaceColours` or reads a box city's fields, can rely on that. Whether the map can draw its grid and
 * its tile size is not checked here: that is for the map as it takes the tileset (`nativeTileSize` in
 * `lib/tilesets.ts`, and the grid's projection, `registerGrid`).
 */
export const validateDescriptor = (json: unknown): TilesetDescriptor => {
  const descriptor = readDescriptor(json),
    problem = notDrawnYet(descriptor);

  if (problem !== null) {
    throw new Error(`Tileset ${descriptorName(json)}: ${problem}`);
  }

  return descriptor;
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

  // A split always gives a first part, and a name after each placeholder: the parts are odd in number.
  let name = parts[0]!;

  for (let i = 1; i < parts.length; i += 2) {
    const placeholder = parts[i]!;

    if (!Object.prototype.hasOwnProperty.call(values, placeholder)) {
      throw new Error(`No value for {${placeholder}} in "${template}".`);
    }

    name += values[placeholder]! + parts[i + 1]!;
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
