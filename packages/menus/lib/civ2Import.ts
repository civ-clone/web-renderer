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
  isFlagRow,
  metadataKey,
} from '@civ-clone/ui-assets/lib/packs';
import { Asset, assetStore } from '@civ-clone/ui-assets/AssetStore';
import {
  ImportOptions,
  PackImport,
  PackImportResult,
  PackImportStatus,
  registerPackImport,
  unsupportedFile,
} from '@civ-clone/ui-assets/lib/packImports';
import { bundledTilesets } from '@civ-clone/ui-assets/lib/tilesets';
import { packFor } from '@civ-clone/ui-assets/lib/installPacks';
import { t } from 'i18next';
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
 *  hasn't got their colours, or has some the map can't draw a flag from (`isFlagRow`). Null when there is nothing to cut, or the file isn't one of Civ2's.
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
          ({ name }) => !isFlagRow(known?.colours?.[name])
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
        isFlagRow(result.colours[name])
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

/** Civilization II's sheets, by their names upper-cased, in the extractor's order. */
export const civ2Files = (): string[] => Object.keys(definitions);

/**
 * The sheets still to import for Civ2's pack to be complete (#97): each one that holds a sprite of `missing`, the
 *  names the pack requires that haven't been imported, and, when what an import says about the sprites (`metadata`) is
 *  missing or can't be read, the ones whose sprites carry anchors or whose flags give the colours, which say it. Flag
 *  colours the map can't draw from (`isFlagRow`) are missing, as the installer holds them to the same rule.
 */
export const civ2FilesToImport = (
  missing: string[],
  metadata: StoredMetadata
): string[] => {
  const wanted = new Set(missing),
    known = metadata === 'unreadable' ? null : metadata;

  return civ2Files().filter((file) => {
    const { grids, flags } = definitions[file]!;

    return (
      grids.some(
        ({ path, names, markers }) =>
          names.some((name) => name !== null && wanted.has(path + name)) ||
          (markers !== undefined &&
            names.some(
              (name) =>
                name !== null && known?.anchors[path + name] === undefined
            ))
      ) ||
      (flags !== undefined &&
        flags.rows.some(({ name }) => !isFlagRow(known?.colours?.[name])))
    );
  });
};

/**
 * Whether Civilization II's map art is all imported (#97), and the sheets to import if not: null when none of it has
 *  been, which is nothing to say, as it's optional.
 */
export const civ2Status = async (): Promise<string[] | null> => {
  const pack = packFor(bundledTilesets().find(({ id }) => id === civ2Pack.id)!),
    [imported, missing, metadata] = await Promise.all([
      assetStore.importedCount(pack),
      assetStore.missingAssets(pack),
      assetStore.readMetadata(pack).catch((): StoredMetadata => 'unreadable'),
    ]);

  // Nothing of it in the store, or a store that can't be read: nothing to say.
  if (imported === 0 && (metadata === null || metadata === 'unreadable')) {
    return null;
  }

  return civ2FilesToImport(
    missing.map((key) =>
      key.slice(pack.storage.prefix.length, -pack.storage.ext.length)
    ),
    metadata
  );
};

/** What `civ2Status` found, as the Import assets window and Options say it: complete, or the sheets to import. */
export const civ2StatusText = (toImport: string[]): string =>
  toImport.length === 0
    ? t('ImportAssetsWindow.civ2-complete')
    : t('ImportAssetsWindow.civ2-incomplete', { files: toImport });

/** What `extractFile` cuts out of one of Civilization II's sheets. */
type Civ2Result = { sprites: Sprite[]; colours?: FlagColours };

/**
 * Reads `file`, one of Civilization II's sheets (#97), and cuts out the sprites it holds that are wanted, as Civ1's
 *  import does Civilization's. Rejects, naming the file, when it can't be read, and resolves with nothing once the file
 *  is no longer `wanted`.
 */
const extractFile = async (
  file: File,
  { existingKeys, replaceExisting, progress, wanted }: ImportOptions,
  stored: StoredMetadata
): Promise<Civ2Result> => {
  const definition = civ2Definition(
      file,
      existingKeys,
      replaceExisting,
      stored
    ),
    nothing: Civ2Result = { sprites: [] };

  if (definition === null) {
    return nothing;
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());

    // The import failed on another file while this one was being read.
    if (!wanted()) {
      return nothing;
    }

    return extractCiv2(bytes, definition, progress);
  } catch (cause) {
    throw unsupportedFile(
      file.name,
      `Could not extract sprites from ${file.name}`,
      cause
    );
  }
};

/**
 * The Civilization II sprites cut out, as the records to store: each as its PNG under Civ2's pack's key for it, and
 *  their anchors and the flag colours in one record beside them, over what an earlier import kept there (`stored`).
 */
const civ2Assets = async (
  results: Civ2Result[],
  stored: StoredMetadata
): Promise<Asset[]> => {
  const sprites = results.flatMap(({ sprites }) => sprites),
    colours = results.flatMap(({ colours }) =>
      colours === undefined ? [] : [colours]
    );

  if (sprites.length === 0 && colours.length === 0) {
    return [];
  }

  return [
    ...(await Promise.all(
      sprites.map(
        async (sprite): Promise<Asset> => ({
          name: civ2Key(sprite.name),
          blob: await spritePng(sprite),
        })
      )
    )),
    metadataAsset(
      mergeMetadata(stored === 'unreadable' ? null : stored, sprites, colours)
    ),
  ];
};

/**
 * Civ2's import (#97): its four sheets, optional, as Civilization's own files are all a game needs, and importable on
 *  their own once those are in. RULES.TXT is taken and left alone.
 */
export const civ2Import: PackImport = {
  id: civ2Pack.id,
  requiredFiles: [],
  accepts: isCiv2File,
  ignores: isCiv2Rules,
  instructions: (): string =>
    t('ImportAssetsWindow.optional-civ2', { files: civ2Files() }),
  import: async (
    files: File[],
    options: ImportOptions
  ): Promise<PackImportResult> => {
    // What an earlier import said about Civilization II's sprites, read first: a grid whose anchors it hasn't got is
    //  cut again, and the rest are kept beside the new ones. One that can't be read is cut again in full, rather than
    //  kept in part.
    const stored: StoredMetadata = await assetStore
        .readMetadata(civ2Pack)
        .catch((error) => {
          console.error(error);

          return 'unreadable' as const;
        }),
      // Civilization II's sheets that couldn't be read, left out beside Civilization's own files.
      skipped: string[] = [],
      results = await Promise.all(
        files.map((file) =>
          extractFile(file, options, stored).catch((error): Civ2Result => {
            if (!options.skipUnreadable) {
              throw error;
            }

            console.warn(`Could not read ${file.name}, skipping.`, error);

            skipped.push(file.name);

            return { sprites: [] };
          })
        )
      );

    return { assets: await civ2Assets(results, stored), skipped };
  },
  // Whether Civilization II's map art is complete, naming the sheets still to import and any of `skipped`, the ones
  //  chosen that couldn't be read. Nothing when none of it has been imported or skipped.
  status: async (skipped: string[]): Promise<PackImportStatus> => {
    const toImport = await civ2Status();

    return {
      lines: [
        ...skipped.map((file) =>
          t('ImportAssetsWindow.civ2-skipped', { file })
        ),
        ...(toImport === null ? [] : [civ2StatusText(toImport)]),
      ],
      incomplete:
        skipped.length > 0 || (toImport !== null && toImport.length > 0),
    };
  },
};

registerPackImport(civ2Import);
