import {
  SpriteAnchors,
  TilesetDescriptor,
} from '../tilesets/TilesetDescriptor';

/**
 * What the asset store needs to know of a pack of sprites (#97): its id, where its sprites are kept, and which of them
 *  it has, as its tileset descriptor says, and whether its import keeps a record of their anchors beside them
 *  (`PackMetadata`, under `metadataKey`), as some packs' imports do (#97).
 */
export type AssetPack = Pick<TilesetDescriptor, 'id' | 'storage' | 'assets'> & {
  metadata?: boolean;
};

/** Where a pack keeps its sprites: see `spriteKey`. */
export type PackStorage = Pick<TilesetDescriptor, 'storage'>;

export type Colour = [r: number, g: number, b: number];

/** The two colours of each player's flag, by row of flags (`flag`, `flag-2`), as a pack's import reads them. */
export interface FlagColours {
  [row: string]: { primary: Colour; secondary: Colour }[];
}

/**
 * What a pack's import says about its sprites besides the sprites themselves: where each one's anchors are (a unit's
 *  `shield`, a city's `flag` and `size`), and the colours of its flags, kept beside its sprites (`metadataKey`).
 */
export interface PackMetadata {
  anchors: SpriteAnchors;
  colours: FlagColours;
}

/** One of a flag's colours as an import records it: red, green and blue, each a whole number 0 to 255. */
export const isColour = (colour: unknown): colour is Colour =>
  Array.isArray(colour) &&
  colour.length === 3 &&
  colour.every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 255
  );

/**
 * Whether `row`, one row of an import's `FlagColours`, can be drawn from: at least one flag, each with a primary and a
 *  secondary colour. The installer and the import both hold a pack's record to this (#97), so a record the map can't
 *  draw a flag from is neither installed nor called complete, and importing CITIES.GIF again repairs it.
 */
export const isFlagRow = (
  row: unknown
): row is { primary: Colour; secondary: Colour }[] =>
  Array.isArray(row) &&
  row.length > 0 &&
  row.every(
    (flag) =>
      typeof flag === 'object' &&
      flag !== null &&
      isColour((flag as { primary?: unknown }).primary) &&
      isColour((flag as { secondary?: unknown }).secondary)
  );

/** The key a pack's `PackMetadata` is kept under: beside its sprites, and never one of them. */
export const metadataKey = ({ storage: { prefix } }: PackStorage): string =>
  `${prefix}metadata.json`;
