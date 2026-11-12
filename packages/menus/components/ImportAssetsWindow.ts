import {
  Definition,
  ExtractData,
  ImageMap,
  extractSprites,
} from '@civ-clone/civ1-asset-extractor/extractSprites';
import {
  Asset,
  SOUND_DRIVER,
  assetFromURI,
  assetStore,
} from '@civ-clone/ui-assets/AssetStore';
import {
  civ2Definition,
  civ2Files,
  civ2Key,
  civ2Status,
  civ2StatusText,
  extractCiv2,
  isCiv2File,
  isCiv2Rules,
  mergeMetadata,
  metadataAsset,
  spritePng,
  StoredMetadata,
} from '../lib/civ2Import';
import CvlImage from '@civ-clone/ui-audio/cvl/Image';
import { FlagColours, civ2Pack } from '@civ-clone/ui-assets/lib/packs';
import { Sprite } from '@civ-clone/civ2-asset-extractor/extractSprites';
import Window, { WindowOptions } from '@civ-clone/ui-component-window/Window';
import { allowLeaving } from '@civ-clone/ui-component-window/leaveGuard';
import { button } from '@civ-clone/ui-component-button/button';
import extractData from '@civ-clone/civ1-asset-extractor/extract-data.json';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { s, t as textNode } from '@dom111/element';
import { t } from 'i18next';

// The files an import needs, and the ones it takes when they're chosen (#64): the extractor lists those as `optional`.
const optionalFiles = (extractData as ExtractData).optional ?? [],
  requiredFiles = Object.keys(extractData.files).filter(
    (file) => !optionalFiles.includes(file)
  ),
  // Civilization's AdLib sound driver, kept as it is for the music (#126) rather than cut up.
  soundFile = 'ASOUND.CVL',
  isSoundFile = (file: File): boolean => file.name.toUpperCase() === soundFile,
  // One of Civilization's own files, the ones its extractor cuts up.
  isCiv1File = (file: File): boolean =>
    Object.prototype.hasOwnProperty.call(
      extractData.files,
      file.name.toUpperCase()
    );

export class ImportAssetsWindow extends Window {
  // The browser's own file input can't take the theme (#739): it stays, hidden, and this button opens it.
  #fileInput: HTMLInputElement;
  #chooseButton: HTMLButtonElement;
  #chosen: HTMLSpanElement;
  #progressInformation: HTMLParagraphElement;
  // Whether Civilization II's map art is complete (#97), when any has been imported.
  #civ2Status: HTMLParagraphElement;
  // Read when the files arrive, not copied on change: a copy started out of
  // step with the box as drawn (#341).
  #replaceExistingInput: HTMLInputElement;
  // The browser keeps nothing for this site (#850): no files can be chosen, whatever else happens.
  #blocked = false;

  constructor(windowOptions: WindowOptions = {}) {
    const fileInput = s<HTMLInputElement>(
        '<input type="file" multiple class="visually-hidden" tabindex="-1" aria-hidden="true">'
      ),
      chooseButton = h(button(t('ImportAssetsWindow.choose')), {
        click: () => fileInput.click(),
      }),
      chosen = s<HTMLSpanElement>(
        `<span class="chosen" aria-live="polite">${t(
          'ImportAssetsWindow.none-chosen'
        )}</span>`
      ),
      replaceExistingInput = s<HTMLInputElement>(
        '<input type="checkbox" checked>'
      ),
      progressInformation = s<HTMLParagraphElement>(
        '<p class="loading" hidden></p>'
      ),
      civ2StatusElement = s<HTMLParagraphElement>(
        '<p class="civ2-status" aria-live="polite" hidden></p>'
      ),
      // Said first, above everything else, when nothing imported could be kept (#850).
      storageBlocked = s<HTMLDivElement>(
        '<div class="storage-blocked" role="alert" hidden></div>'
      );

    super(
      t('ImportAssetsWindow.title'),
      s(
        `<div class="import-assets"><p>${t('ImportAssetsWindow.instructions', {
          files: requiredFiles,
        })}${
          optionalFiles.length
            ? ` ${t('ImportAssetsWindow.optional', { files: optionalFiles })}`
            : ''
        } ${t('ImportAssetsWindow.optional-sound', {
          file: soundFile,
        })} ${t('ImportAssetsWindow.optional-civ2', {
          files: civ2Files(),
        })}</p><div class="brave" ${
          // @ts-ignore
          navigator?.brave ? '' : ' hidden'
        }>${t('ImportAssetsWindow.brave')}</div></div>`,
        s(
          '<p></p>',
          s(
            '<label></label>',
            replaceExistingInput,
            textNode(t('ImportAssetsWindow.replace-existing'))
          )
        ),
        s(
          '<p class="file-picker"></p>',
          chooseButton,
          chosen,
          h(fileInput, {
            change: (event) => {
              const names = Array.from(
                fileInput.files ?? [],
                ({ name }) => name
              );

              this.#showChosen(names);

              // Nothing chosen (the picker closed after an earlier choice) isn't an attempt to import.
              if (names.length) {
                this.handleFileUpload(event);
              }
            },
          })
        ),
        progressInformation,
        civ2StatusElement
      ),
      windowOptions
    );

    this.#fileInput = fileInput;
    this.#chooseButton = chooseButton;
    this.#chosen = chosen;
    this.#replaceExistingInput = replaceExistingInput;
    this.#progressInformation = progressInformation;
    this.#civ2Status = civ2StatusElement;

    // A browser that blocks this site's data would keep nothing that was imported (#850): said before any files are
    //  chosen, at the top of the window, and the choosing is put out of reach rather than left to fail.
    this.element().querySelector('.import-assets')?.prepend(storageBlocked);

    // A store that can't be read has nothing to say about it.
    void this.#showCiv2Status().catch(() => {});

    assetStore.usable().then((usable): void => {
      if (usable) {
        return;
      }

      this.#blocked = true;

      storageBlocked.textContent = t('ImportAssetsWindow.storage-blocked');
      storageBlocked.removeAttribute('hidden');
      fileInput.setAttribute('disabled', '');
      chooseButton.disabled = true;
      replaceExistingInput.disabled = true;
    });
  }

  async handleFileUpload(event: InputEvent) {
    this.#progressInformation.removeAttribute('hidden');
    this.#progressInformation.classList.remove('failed');

    const files = Array.from(
        (event.target as HTMLInputElement).files ?? []
      ) as File[],
      filenames: string[] = files.map((file: File) => file.name),
      expectedFilenames = requiredFiles,
      expectedMatches = expectedFilenames.map((key) => new RegExp(key, 'i')),
      // ASOUND.CVL alone is enough once the sprites are in (#126): the music can be added later. So are Civilization
      //  II's sheets (#97), for its map.
      adding =
        files.some((file) => isSoundFile(file) || isCiv2File(file)) &&
        (await assetStore.hasAllAssets().catch((): boolean => false));

    if (
      !adding &&
      !expectedMatches.every((expectedMatch) =>
        filenames.some((filename) => filename.match(expectedMatch))
      )
    ) {
      this.#fail(
        t('ImportAssetsWindow.missing-files', { files: expectedFilenames })
      );

      return;
    }

    this.#fileInput.setAttribute('disabled', '');
    this.#chooseButton.disabled = true;
    this.#progressInformation.innerText = t(
      'ImportAssetsWindow.progress-building'
    );

    try {
      await this.#import(files);
    } catch (error) {
      // A file the extractor can't read (not a Civilization sheet, or one
      //  cut differently from the originals) used to throw inside the
      //  reader's `load` listener, where nothing caught it: the promise never
      //  settled and the window sat on "Building image assets..." for good.
      //  The store refusing to open or write left it the same way.
      console.error(error);

      this.#fail(
        isUnsupportedFile(error)
          ? t('ImportAssetsWindow.unsupported-file', { file: error.file })
          : t('ImportAssetsWindow.failed', {
              error: error instanceof Error ? error.message : String(error),
            })
      );
    }
  }

  /**
   * Extracts the sprites from `files`, stores them, and reloads the page to
   * use them. Rejects with what went wrong, which `handleFileUpload` shows.
   */
  async #import(files: File[]): Promise<void> {
    const existingKeys = await assetStore.keys(),
      replaceExisting = this.#replaceExistingInput.checked;

    // Only while the files are being extracted: one still being extracted
    //  after another has failed would write its progress over the reason the
    //  import stopped, and needn't be cut up at all.
    let extracting = true;

    const progress = (message: string): void => {
        if (extracting) {
          this.#progressInformation.innerText = message;
        }
      },
      wanted = (): boolean => extracting;

    // ASOUND.CVL, checked before anything is cut up: kept as the file it is.
    const sound = await this.#sound(files.find(isSoundFile));

    // What an earlier import said about Civilization II's sprites (#97), read first: a grid whose anchors it hasn't got
    //  is cut again, and the rest are kept beside the new ones. One that can't be read is cut again in full, rather
    //  than kept in part.
    const civ2Files = files.filter(isCiv2File),
      stored: StoredMetadata =
        civ2Files.length === 0
          ? null
          : await assetStore.readMetadata(civ2Pack).catch((error) => {
              console.error(error);

              return 'unreadable' as const;
            }),
      // With Civilization's own files in the import, a Civilization II sheet that can't be read is left out, rather
      //  than stopping theirs.
      civ1Chosen = files.some(isCiv1File);

    let results: ImageMap[], civ2: Civ2Result[];

    // Civilization II's sheets that couldn't be read, left out beside Civilization's own files.
    const skipped: string[] = [];

    try {
      // Every file, read and its sprites extracted: Civilization's by its extractor, Civilization II's by its own
      //  (#97). RULES.TXT is left alone: its units keep their default names for now.
      [results, civ2] = await Promise.all([
        Promise.all(
          files
            .filter(
              (file) =>
                !isSoundFile(file) && !isCiv2File(file) && !isCiv2Rules(file)
            )
            .map((file) =>
              this.#extract(
                file,
                existingKeys,
                replaceExisting,
                progress,
                wanted
              )
            )
        ).then((results) => results.flat()),
        Promise.all(
          civ2Files.map((file) =>
            this.#extractCiv2(
              file,
              existingKeys,
              replaceExisting,
              stored,
              progress,
              wanted
            ).catch((error): Civ2Result => {
              if (!civ1Chosen) {
                throw error;
              }

              console.warn(`Could not read ${file.name}, skipping.`, error);

              skipped.push(file.name);

              return { sprites: [] };
            })
          )
        ),
      ]);
    } finally {
      extracting = false;
    }

    this.#progressInformation.innerText = t(
      'ImportAssetsWindow.progress-writing'
    );

    // ...and all results stored in IDB, in a single transaction, each as its PNG rather than the data URI the
    //  extractor gives (#730).
    await assetStore.setAll([
      ...(await Promise.all(
        results.map(({ name, uri }) => assetFromURI(name, uri))
      )),
      ...(await this.#civ2Assets(civ2, stored)),
      ...sound,
    ]);

    if (!(await assetStore.hasAllAssets())) {
      console.error('Something went wrong...');

      this.#fail(
        t('ImportAssetsWindow.missing-data', {
          files: await assetStore.missingAssets(),
        })
      );

      return;
    }

    this.#progressInformation.innerText = t('ImportAssetsWindow.done');

    // Civilization II's sheets that were chosen (#97): one left out, or the art still incomplete, is said, and the page
    //  left for the player to reload once they've read it, rather than reloaded from under them.
    if (civ2Files.length > 0) {
      const incomplete = await this.#showCiv2Status(skipped);

      if (incomplete) {
        allowLeaving();
        this.#chooseAgain();

        return;
      }
    }

    // We need to reprocess everything and this is the lazy way...
    allowLeaving();

    location.reload();
  }

  /**
   * Says whether Civilization II's map art is complete (#97), naming the sheets still to import and any of `skipped`,
   *  the ones chosen that couldn't be read. Says nothing when none of it has been imported or skipped. Resolves with
   *  whether there was anything wrong to say.
   */
  async #showCiv2Status(skipped: string[] = []): Promise<boolean> {
    const toImport = await civ2Status(),
      lines = [
        ...skipped.map((file) =>
          t('ImportAssetsWindow.civ2-skipped', { file })
        ),
        ...(toImport === null ? [] : [civ2StatusText(toImport)]),
      ];

    this.#civ2Status.textContent = lines.join(' ');
    this.#civ2Status.toggleAttribute('hidden', lines.length === 0);

    return skipped.length > 0 || (toImport !== null && toImport.length > 0);
  }

  /**
   * Reads `file` and cuts out the sprites it holds that are wanted: all of
   * them with `replaceExisting`, otherwise only the groups with a sprite the
   * store doesn't have yet (so a re-import picks up sprites added to the
   * extractor since). Rejects, naming the file, when it can't be read, and
   * resolves with nothing once the file is no longer `wanted`.
   */
  #extract(
    file: File,
    existingKeys: string[],
    replaceExisting: boolean,
    progress: (message: string) => void,
    wanted: () => boolean
  ): Promise<ImageMap[]> {
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
            Object.assign(
              new Error(`Could not extract sprites from ${file.name}`, {
                cause,
              }),
              { file: file.name }
            ) as UnsupportedFile
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
  }

  /**
   * Reads `file`, one of Civilization II's sheets (#97), and cuts out the sprites it holds that are wanted, as
   *  `#extract` does Civilization's. Rejects, naming the file, when it can't be read, and resolves with nothing once the
   *  file is no longer `wanted`.
   */
  async #extractCiv2(
    file: File,
    existingKeys: string[],
    replaceExisting: boolean,
    stored: StoredMetadata,
    progress: (message: string) => void,
    wanted: () => boolean
  ): Promise<Civ2Result> {
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
      throw Object.assign(
        new Error(`Could not extract sprites from ${file.name}`, { cause }),
        { file: file.name }
      ) as UnsupportedFile;
    }
  }

  /**
   * The Civilization II sprites cut out, as the records to store: each as its PNG under Civ2's pack's key for it, and
   *  their anchors and the flag colours in one record beside them, over what an earlier import kept there (`stored`).
   */
  async #civ2Assets(
    results: Civ2Result[],
    stored: StoredMetadata
  ): Promise<Asset[]> {
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
  }

  /**
   * ASOUND.CVL as a record to store, once `cvl/Image` has read it as the AdLib driver (#126), or nothing if it wasn't
   *  chosen. Rejects, naming the file, when it isn't the driver.
   */
  async #sound(file: File | undefined): Promise<Asset[]> {
    if (file === undefined) {
      return [];
    }

    let bytes: ArrayBuffer;

    try {
      bytes = await file.arrayBuffer();
      new CvlImage(bytes);
    } catch (cause) {
      throw Object.assign(
        new Error(`${file.name} is not the AdLib sound driver`, { cause }),
        { file: file.name }
      ) as UnsupportedFile;
    }

    return [
      {
        name: SOUND_DRIVER,
        blob: new Blob([bytes], { type: 'application/octet-stream' }),
      },
    ];
  }

  /** The names of the files chosen, as text beside the button (#739). */
  #showChosen(names: string[]): void {
    this.#chosen.textContent = names.length
      ? t('ImportAssetsWindow.chosen', {
          files: names,
          // Set as text, so a name with `&` or `<` in it shows as it is.
          interpolation: { escapeValue: false },
        })
      : t('ImportAssetsWindow.none-chosen');
  }

  /** Shows `message` as the reason the import stopped, and lets the player choose files again. */
  #fail(message: string): void {
    this.#progressInformation.classList.add('failed');
    this.#progressInformation.innerText = message;

    this.#chooseAgain();
  }

  /** Lets the player choose files again: after a failed import, or one that left Civilization II's art incomplete. */
  #chooseAgain(): void {
    // Chosen before the browser was found to keep nothing: there is no trying again.
    if (!this.#blocked) {
      this.#fileInput.removeAttribute('disabled');
      this.#chooseButton.disabled = false;
    }

    // So choosing the same files again counts as a change.
    this.#fileInput.value = '';
    this.#showChosen([]);
  }
}

/** What `#extractCiv2` cuts out of one of Civilization II's sheets. */
type Civ2Result = { sprites: Sprite[]; colours?: FlagColours };

/** The error `#extract` rejects with: which file it was that couldn't be read. */
type UnsupportedFile = Error & { file: string };

const isUnsupportedFile = (error: unknown): error is UnsupportedFile =>
  error instanceof Error && typeof (error as UnsupportedFile).file === 'string';

export default ImportAssetsWindow;
