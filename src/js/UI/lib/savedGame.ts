import { Store } from '../Store';
import { allowLeaving } from './leaveGuard';
import { t } from 'i18next';

/**
 * Saving and loading, from the player's side.
 *
 * A save leaves the browser as a file. It is the player's, it outlives a
 * cleared cache, and it can be moved between machines — none of which is true
 * of anything kept in browser storage.
 *
 * Loading reloads the page, and the save is handed over in browser storage on
 * the way through. That is not a detail of the storage; it is how the engine
 * gets a clean start. Plugins register their rules when they are imported, and
 * those rules close over the singleton registries the running game is already
 * using, so a game cannot be loaded over the top of one that is in progress. A
 * reload gives a new worker, with nothing in it.
 */
const PENDING = 'civ-clone:pending-save';

/**
 * The hand-over: a marker in `sessionStorage`, the save itself in IndexedDB.
 *
 * Both used to be `sessionStorage`, which browsers cap at around 5M characters
 * per origin. The file on disk is gzipped and small — 108KB, 244KB — but what
 * is handed over is the JSON inside it: 1.6MB on turn 1, 7.7MB on turn 130,
 * 11.5MB on a turn-110 game with more of a world in it. So loading worked for
 * a save made in the first few turns and threw `QuotaExceededError` for every
 * real one, after which the page did not reload and nothing was said (#5).
 * IndexedDB has no such cap, and takes the string whether or not the browser
 * can compress.
 *
 * The marker stays behind because the two are scoped differently:
 * `sessionStorage` belongs to the tab, IndexedDB to the origin. It is what
 * keeps a save waiting mid-reload from being picked up by a different tab, or
 * by this origin's next visit if the reload never happens.
 */
type PendingSave = {
  'pending-save': {
    key: string;
    value: string;
  };
};

let store: Store<PendingSave> | null = null;

const pendingSaveStore = (): Store<PendingSave> => {
  if (store === null) {
    store = new Store<PendingSave>('civ-clone-saved-game', 'pending-save');
  }

  return store;
};

/** Best-effort, and called from paths that are already reporting a failure. */
const discardPendingSave = async (): Promise<void> => {
  try {
    sessionStorage.removeItem(PENDING);

    await pendingSaveStore().clear();
  } catch {
    // Nothing useful to do about a failure to clean up after a failure.
  }
};

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

  try {
    await pendingSaveStore().set(data, PENDING);

    sessionStorage.setItem(PENDING, 'waiting');
  } catch (error) {
    // The reload *is* the load: with nothing handed over there would be
    // nothing on the other side of it, so say so and stay where we are rather
    // than blink and carry on with the game that is already running.
    await discardPendingSave();

    window.alert(
      t('SavedGame.could-not-hand-over', { error: (error as Error).message })
    );

    throw error;
  }

  allowLeaving();

  window.location.reload();
};

/** The save waiting to be loaded, taken rather than read: one reload, one go. */
export const takePendingSave = async (): Promise<string | null> => {
  // The marker first, and only then the store: it is what says the save
  // waiting on this origin is this tab's, and it means a page load that is not
  // a hand-over never opens the database at all.
  if (sessionStorage.getItem(PENDING) === null) {
    return null;
  }

  try {
    const data = (await pendingSaveStore().get(PENDING)) ?? null;

    await discardPendingSave();

    return data;
  } catch (error) {
    await discardPendingSave();

    window.alert(
      t('SavedGame.could-not-read', { error: (error as Error).message })
    );

    return null;
  }
};

/** A file picker, for a menu item to hang off. */
export const chooseSaveFile = (): void => {
  const input = document.createElement('input');

  input.type = 'file';
  input.accept = '.json,.gz,application/json,application/gzip';
  input.addEventListener('change', (): void => {
    const [file] = input.files ?? [];

    if (file) {
      // The player has already been told by the time this rejects; it is
      // rethrown for callers that want it, and there is no caller here.
      loadSaveFromFile(file).catch((): void => {});
    }
  });

  input.click();
};
