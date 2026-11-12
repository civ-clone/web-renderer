import {
  ExtractData,
  ExtractResult,
  FileDefinition,
  FlagDefinition,
  Sprite,
  extractSprites,
} from '@civ-clone/civ2-asset-extractor/extractSprites';
import GifImage from '@civ-clone/civ2-asset-extractor/GifImage';
import {
  FlagColours,
  PackMetadata,
  civ2Pack,
  metadataKey,
} from '@civ-clone/ui-assets/lib/packs';
import { Asset } from '@civ-clone/ui-assets/AssetStore';
import extractData from '@civ-clone/civ2-asset-extractor/extract-data.json';
import { spriteKey } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

// The sheets Civilization II's map is cut from (#97), by their names upper-cased: TERRAIN1.GIF, TERRAIN2.GIF,
//  UNITS.GIF and CITIES.GIF.
const definitions = (extractData as ExtractData).files;

/** Whether `file` is one of Civilization II's sheets, whatever the case of its name. */
export const isCiv2File = ({ name }: { name: string }): boolean =>
  Object.prototype.hasOwnProperty.call(definitions, name.toUpperCase());

/**
 * Whether `file` is Civilization II's RULES.TXT: the extractor would name the units from it, but they keep their
 *  default names for now (#97), so it is taken and left alone rather than refused.
 */
export const isCiv2Rules = ({ name }: { name: string }): boolean =>
  name.toUpperCase() === 'RULES.TXT';

/** The key the sprite the Civ2 extractor calls `name` is kept under: `./assets/civ2/<name>.png`. */
export const civ2Key = (name: string): string => spriteKey(civ2Pack, name);

/**
 * What an earlier import kept about Civ2's sprites: their anchors and the flags' colours, nothing (null), or a record
 *  that couldn't be read.
 */
export type StoredMetadata = PackMetadata | null | 'unreadable';

/**
 * The part of `file`'s definition to cut out: every grid with `replaceExisting`. Otherwise only the grids with a
 *  sprite the store doesn't have yet, so a re-import picks up sprites added to the extractor since, or, for a grid with
 *  markers, one whose anchors `stored` hasn't got (all of them, when it couldn't be read); and the flags when `stored`
 *  hasn't got their colours. Null when there is nothing to cut, or the file isn't one of Civ2's.
 */
export const civ2Definition = (
  file: { name: string },
  existingKeys: string[],
  replaceExisting: boolean,
  stored: StoredMetadata = null
): FileDefinition | null => {
  const definition = definitions[file.name.toUpperCase()];

  if (definition === undefined) {
    return null;
  }

  const existing = new Set(existingKeys),
    known = stored === 'unreadable' ? null : stored,
    grids = definition.grids.filter(
      ({ path, names, markers }) =>
        replaceExisting ||
        names.some(
          (name) =>
            name !== null &&
            (!existing.has(civ2Key(path + name)) ||
              (markers !== undefined &&
                known?.anchors[path + name] === undefined))
        )
    ),
    flagsWanted =
      definition.flags !== undefined &&
      (replaceExisting ||
        definition.flags.rows.some(
          ({ name }) => known?.colours[name] === undefined
        ));

  if (grids.length === 0 && !flagsWanted) {
    return null;
  }

  // Without the flags when their colours are kept: the flag sprites may be left as they are, and colours read from
  //  another sheet would no longer match them.
  return flagsWanted ? { ...definition, grids } : { grids };
};

/**
 * Throws unless `image` is laid out as `flags` say Civ2's flags are: a 256-colour sheet with every flag inside it. The
 *  extractor checks its grids this way but not its flags, which are all it reads when only their colours are wanted.
 */
const checkFlags = (image: GifImage, flags: FlagDefinition): void => {
  const stepX = flags.stepX ?? flags.width + 1,
    right = flags.x + (flags.count - 1) * stepX + flags.width;

  if (image.palette().length !== 256) {
    throw new TypeError(
      `Expected a 256-colour sheet, not ${image.palette().length} colours.`
    );
  }

  if (
    flags.x < 0 ||
    right > image.width() ||
    flags.rows.some(({ y }) => y < 0 || y + flags.height > image.height())
  ) {
    throw new TypeError(
      `The flags don't fit a ${image.width()}×${image.height()} sheet.`
    );
  }
};

const isColour = (colour: unknown): boolean =>
  Array.isArray(colour) &&
  colour.length === 3 &&
  colour.every((value) => Number.isInteger(value));

/**
 * The sprites and flag colours cut from `bytes`, one of Civ2's sheets, by `definition`, with the flags' layout checked
 *  first and every row of their colours read in full. Throws for a sheet it can't read.
 */
export const extractCiv2 = (
  bytes: Uint8Array,
  definition: FileDefinition,
  progress: (message: string) => void = () => {}
): ExtractResult => {
  const { flags } = definition;

  if (flags !== undefined) {
    checkFlags(GifImage.fromBytes(bytes), flags);
  }

  const result = extractSprites(bytes, definition, progress);

  if (
    flags !== undefined &&
    !flags.rows.every(
      ({ name }) =>
        result.colours?.[name]?.length === flags.count &&
        result.colours[name]!.every(
          ({ primary, secondary }) => isColour(primary) && isColour(secondary)
        )
    )
  ) {
    throw new TypeError("The flags' colours could not be read.");
  }

  return result;
};

/**
 * `sprite` as a PNG, drawn on a canvas, which the browser encodes. `createImageData` rather than `new ImageData`, so
 *  the canvas alone is needed.
 */
export const spritePng = ({
  name,
  width,
  height,
  data,
}: Sprite): Promise<Blob> => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (context === null) {
    return Promise.reject(new Error(`Could not draw ${name}.`));
  }

  const image = context.createImageData(width, height);

  image.data.set(data);
  context.putImageData(image, 0, 0);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob === null
          ? reject(new Error(`Could not encode ${name}.`))
          : resolve(blob),
      'image/png'
    )
  );
};

/**
 * `existing` with the anchors of `sprites` and the flag `colours` cut since put over it: an import of some of the
 *  sheets keeps what the others said.
 */
export const mergeMetadata = (
  existing: PackMetadata | null,
  sprites: Sprite[],
  colours: FlagColours[]
): PackMetadata => {
  const metadata: PackMetadata = {
    anchors: { ...(existing?.anchors ?? {}) },
    colours: { ...(existing?.colours ?? {}) },
  };

  sprites.forEach(({ name, anchors }) => {
    if (anchors !== undefined) {
      metadata.anchors[name] = anchors;
    }
  });

  colours.forEach((rows) => Object.assign(metadata.colours, rows));

  return metadata;
};

/** `metadata` as the record the store keeps it in, beside the pack's sprites. */
export const metadataAsset = (metadata: PackMetadata): Asset => ({
  name: metadataKey(civ2Pack),
  blob: new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
});
