import { t } from 'i18next';

/**
 * Saving and loading, from the player's side.
 *
 * A save leaves the browser as a file. It is the player's, it outlives a
 * cleared cache, and it can be moved between machines — none of which is true
 * of anything kept in browser storage.
 *
 * Loading reloads the page, and the save is handed over in `sessionStorage`
 * on the way through. That is not a detail of the storage; it is how the
 * engine gets a clean start. Plugins register their rules when they are
 * imported, and those rules close over the singleton registries the running
 * game is already using, so a game cannot be loaded over the top of one that
 * is in progress. A reload gives a new worker, with nothing in it.
 */
const PENDING = 'civ-clone:pending-save';

const GZIP_MAGIC = [0x1f, 0x8b];

/**
 * Saves are gzipped where the browser can.
 *
 * A turn-1 save is about 1.6MB of JSON, and it is JSON of the most compressible
 * kind: every entity repeats the same field names, and most of the file is
 * references like `{"$ref":"Tile-1f4"}`. Gzip takes better than 90% of it off.
 *
 * `CompressionStream` is in every current browser, but a save that cannot be
 * written is worse than a large one — so without it the file is written as
 * plain JSON, and either is read back.
 */
const canCompress = (): boolean => typeof CompressionStream !== 'undefined';

const compressed = async (data: string): Promise<Blob> =>
  new Response(
    new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))
  ).blob();

const decompressed = async (data: ArrayBuffer): Promise<string> =>
  new Response(
    new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))
  ).text();

/**
 * A name a file system will take, and a person will recognise.
 *
 * Nothing is escaped on the way in: i18next escapes interpolated values for
 * HTML by default, so a localised date arrived as `16&#x2F;09&#x2F;2026` and
 * came out of here as `16x2F09x2F2026` once the punctuation was stripped. The
 * default name is built from plain parts instead — see `GameMenu` — and this
 * only removes what a file name cannot hold.
 */
export const fileName = (name: string, extension: string): string =>
  `${
    name
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'civ-clone'
  }.civ-clone.${extension}`;

export const downloadSave = async (
  name: string,
  data: string
): Promise<void> => {
  const compress = canCompress(),
    blob = compress
      ? await compressed(data)
      : new Blob([data], { type: 'application/json' }),
    url = URL.createObjectURL(blob),
    anchor = document.createElement('a');

  // Not `s()`: this needs an object URL on `href`, and it is never in the
  // document — it is clicked and dropped.
  anchor.href = url;
  anchor.download = fileName(name, compress ? 'json.gz' : 'json');
  anchor.click();

  // After the click, so the download has the URL it was given.
  setTimeout((): void => URL.revokeObjectURL(url), 10000);
};

/** Gzipped or not, as written by any build. */
const readSave = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer(),
    header = new Uint8Array(buffer.slice(0, 2));

  if (!GZIP_MAGIC.every((byte, index) => header[index] === byte)) {
    return new TextDecoder().decode(buffer);
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new TypeError(t('SavedGame.no-decompression'));
  }

  return decompressed(buffer);
};

/** Reads a save the player chose, and reloads into it. */
export const loadSaveFromFile = async (file: File): Promise<void> => {
  let data: string;

  try {
    data = await readSave(file);

    const parsed = JSON.parse(data);

    if (typeof parsed?.format !== 'number' || !Array.isArray(parsed.entities)) {
      throw new TypeError(t('SavedGame.not-a-save'));
    }
  } catch (error) {
    // Before the reload, while there is still a page to say it on.
    window.alert(
      t('SavedGame.could-not-read', { error: (error as Error).message })
    );

    throw error;
  }

  sessionStorage.setItem(PENDING, data);
  window.location.reload();
};

/** The save waiting to be loaded, taken rather than read: one reload, one go. */
export const takePendingSave = (): string | null => {
  const data = sessionStorage.getItem(PENDING);

  sessionStorage.removeItem(PENDING);

  return data;
};

/** A file picker, for a menu item to hang off. */
export const chooseSaveFile = (): void => {
  const input = document.createElement('input');

  input.type = 'file';
  input.accept = '.json,.gz,application/json,application/gzip';
  input.addEventListener('change', (): void => {
    const [file] = input.files ?? [];

    if (file) {
      loadSaveFromFile(file);
    }
  });

  input.click();
};
