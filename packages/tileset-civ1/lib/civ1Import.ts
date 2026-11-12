import {
  ChosenFile,
  ImportOptions,
  PackImport,
  PackImportResult,
  unsupportedFile,
} from '@civ-clone/ui-assets/lib/packImports';
import {
  Definition,
  ExtractData,
  ImageMap,
  extractSprites,
} from '@civ-clone/civ1-asset-extractor/extractSprites';
import { assetFromURI } from '@civ-clone/ui-assets/AssetStore';
import civ1 from '../civ1.json';
import extractData from '@civ-clone/civ1-asset-extractor/extract-data.json';
import { t } from 'i18next';

// The files an import needs, and the ones it takes when they're chosen (#64): the extractor lists those as `optional`.
const optionalFiles = (extractData as ExtractData).optional ?? [],
  requiredFiles = Object.keys(extractData.files).filter(
    (file) => !optionalFiles.includes(file)
  );

/** Whether `file` is one of Civilization's own files, the ones its extractor cuts up, whatever the case of its name. */
export const isCiv1File = ({ name }: ChosenFile): boolean =>
  Object.prototype.hasOwnProperty.call(extractData.files, name.toUpperCase());

/**
 * Reads `file` and cuts out the sprites it holds that are wanted: all of them with `replaceExisting`, otherwise only
 *  the groups with a sprite the store doesn't have yet (so a re-import picks up sprites added to the extractor since).
 *  Rejects, naming the file, when it can't be read, and resolves with nothing once the file is no longer `wanted`.
 */
const extract = (
  file: File,
  { existingKeys, replaceExisting, progress, wanted }: ImportOptions
): Promise<ImageMap[]> => {
  const allDefinitions = (extractData as ExtractData).files[
    file.name.toUpperCase()
  ];

  if (!allDefinitions) {
    console.warn(`No definitions found for ${file.name}, skipping.`);

    return Promise.resolve([]);
  }

  const definitions = Object.keys(allDefinitions).reduce((object, key) => {
    // `key` is the sprites' path ("units/"), and each of its definitions names some of them: the index of the
    //  definition isn't part of it, which made this never match, so nothing already imported was ever skipped.
    const filenamesForObject = allDefinitions[key]!.flatMap((definition) =>
      definition.contents.map((entry) => `./assets/${key + entry.name}.png`)
    );

    if (
      filenamesForObject.every((path) => existingKeys.includes(path)) &&
      !replaceExisting
    ) {
      return object;
    }

    object[key] = allDefinitions[key]!;

    return object;
  }, {} as Definition);

  return new Promise<ImageMap[]>((resolve, reject) => {
    const reader = new FileReader(),
      failed = (cause: unknown) =>
        reject(
          unsupportedFile(
            file.name,
            `Could not extract sprites from ${file.name}`,
            cause
          )
        );

    reader.addEventListener('error', () => failed(reader.error));
    reader.addEventListener('load', () => {
      // The import failed on another file while this one was being read.
      if (!wanted()) {
        resolve([]);

        return;
      }

      try {
        resolve(
          extractSprites(
            reader.result as string,
            definitions,
            extractData.defaults,
            (width, height) => {
              const canvas = document.createElement('canvas');

              canvas.width = width;
              canvas.height = height;

              return canvas;
            },
            progress
          )
        );
      } catch (error) {
        failed(error);
      }
    });

    reader.readAsBinaryString(file);
  });
};

/**
 * Civ1's import: the sprites cut from Civilization's own files (`TER257.PIC`, `SP257.PIC`, and `SP299.PIC` for the city
 *  screen's icons) by its extractor, each stored as its PNG rather than the data URI the extractor gives (#730), under
 *  the key the import has always kept it under (`./assets/<path><name>.png`). The interface's, so the import needs it.
 */
export const civ1Import: PackImport = {
  // The tileset's own id, so the import and the pack it fills can't drift apart.
  id: civ1.id,
  requiredFiles,
  accepts: isCiv1File,
  instructions: (): string =>
    `${t('TilesetCiv1.import', { files: requiredFiles })}${
      optionalFiles.length
        ? ` ${t('TilesetCiv1.import-optional', { files: optionalFiles })}`
        : ''
    }`,
  import: async (
    files: File[],
    options: ImportOptions
  ): Promise<PackImportResult> => {
    const results = (
      await Promise.all(files.map((file) => extract(file, options)))
    ).flat();

    return {
      assets: await Promise.all(
        results.map(({ name, uri }) => assetFromURI(name, uri))
      ),
      skipped: [],
    };
  },
};

export default civ1Import;
