import {
  SpriteAnchors,
  TilesetDescriptor,
} from '../tilesets/TilesetDescriptor';

/**
 * What the asset store needs to know of a pack of sprites (#97): its id, where its sprites are kept, and which of them
 *  it has, as its tileset descriptor says, and whether its import keeps a record of their anchors beside them
 *  (`PackMetadata`, under `metadataKey`), as Civ2's does and Civ1's doesn't.
 */
export type AssetPack = Pick<TilesetDescriptor, 'id' | 'storage' | 'assets'> & {
  metadata?: boolean;
};

/** Where a pack keeps its sprites: see `spriteKey`. */
export type PackStorage = Pick<TilesetDescriptor, 'storage'>;

/**
 * Civ2's pack (#97), as the Import Assets window stores the sprites cut from the player's own copy of Civilization II:
 *  each under `./assets/civ2/<name>.png`, by the name the Civ2 extractor gives it (`units/settlers`), beside Civ1's,
 *  which keep their own keys. Its descriptor, which says which sprites it needs, is bundled separately.
 */
export const civ2Pack = {
  id: 'civ2',
  storage: { prefix: './assets/civ2/', ext: '.png' },
  metadata: true,
} as const;

export type Colour = [r: number, g: number, b: number];

/** The two colours of each player's flag, by row of flags (`flag`, `flag-2`), as the Civ2 extractor reads them. */
export interface FlagColours {
  [row: string]: { primary: Colour; secondary: Colour }[];
}

/**
 * What a pack's import says about its sprites besides the sprites themselves: where each one's anchors are (a unit's
 *  `shield`, a city's `flag` and `size`), and the colours of its flags. The Civ2 extractor's `metadata.json`.
 */
export interface PackMetadata {
  anchors: SpriteAnchors;
  colours: FlagColours;
}

/** The key a pack's `PackMetadata` is kept under: beside its sprites, and never one of them. */
export const metadataKey = ({ storage: { prefix } }: PackStorage): string =>
  `${prefix}metadata.json`;
