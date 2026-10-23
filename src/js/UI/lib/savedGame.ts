import { Store } from '../Store';
import {
  SeatChanges,
  isSeatChanges,
  savedSeats,
} from '../../Engine/lib/savedSeats';
import { allowLeaving } from './leaveGuard';
import { isSupportedTopology } from './supportedTopologies';
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
const PENDING = 'civ-clone:pending-save',
  // The seats reassigned before the load (#608), small enough for `sessionStorage` beside the marker.
  PENDING_SEATS = 'civ-clone:pending-save-seats';

/** A save handed over for loading: the file, and the seats reassigned on the way. */
export type PendingLoad = { data: string; seats: SeatChanges };

/**
 * How the seats of a save are offered for reassigning before it loads (#608): the resume window on the page. Settles
 * with the seats changed, or `null` for a load called off. Given, rather than imported, so that this file stays free
 * of the page's windows.
 */
export type AskSeats = (
  save: Parameters<typeof savedSeats>[0]
) => Promise<SeatChanges | null>;

const keepSeats: AskSeats = async () => ({});

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
    sessionStorage.removeItem(PENDING_SEATS);

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

/**
 * Which grid a save's world is on (#89), from the save itself: the `World`'s saved `_topologyId`. A save made before
 * the grid was recorded has none, and is square.
 */
export const savedTopologyId = (save: {
  entities: { type?: string; state?: { [field: string]: unknown } }[];
}): string => {
  const topologyId = save.entities.find(({ type }) => type === 'World')?.state
    ?._topologyId;

  return typeof topologyId === 'string' ? topologyId : 'square';
};

/** The name of the grid `topologyId`, for telling the player about it. */
export const gridName = (topologyId: string): string =>
  t(`Grid.${topologyId}`, { defaultValue: topologyId });

/**
 * Reads a save the player chose, shows its seats for reassigning (#608), and reloads into it. Closing the seats
 * window instead loads nothing.
 */
export const loadSaveFromFile = async (
  file: File,
  askSeats: AskSeats = keepSeats
): Promise<void> => {
  let data: string, parsed: any;

  try {
    data = await readSave(file);

    parsed = JSON.parse(data);

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

  // A world on a grid that can't be drawn here would load into a map of nonsense: say so, and stay on the menu.
  const topologyId = savedTopologyId(parsed);

  if (!isSupportedTopology(topologyId)) {
    const message = t('SavedGame.needs-grid', { grid: gridName(topologyId) });

    window.alert(message);

    throw new Error(message);
  }

  let seats: SeatChanges | null;

  try {
    seats = await askSeats(parsed);
  } catch (error) {
    // A file whose seats can't be read, or a worker that won't say what AI clients there are: said, as a file that
    //  can't be read is, rather than loading nothing in silence.
    window.alert(
      t('SavedGame.could-not-read', { error: (error as Error).message })
    );

    throw error;
  }

  if (seats === null) {
    return;
  }

  try {
    await pendingSaveStore().set(data, PENDING);

    sessionStorage.setItem(PENDING, 'waiting');
    sessionStorage.setItem(PENDING_SEATS, JSON.stringify(seats));
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

/** The save waiting to be loaded, with its seats, taken rather than read: one reload, one go. */
export const takePendingSave = async (): Promise<PendingLoad | null> => {
  // The marker first, and only then the store: it is what says the save
  // waiting on this origin is this tab's, and it means a page load that is not
  // a hand-over never opens the database at all.
  if (sessionStorage.getItem(PENDING) === null) {
    // Seats left from a load that never happened are nobody's: gone, so they never go with a later save.
    sessionStorage.removeItem(PENDING_SEATS);

    return null;
  }

  try {
    const data = (await pendingSaveStore().get(PENDING)) ?? null,
      seats = parseSeats(sessionStorage.getItem(PENDING_SEATS));

    await discardPendingSave();

    return data === null ? null : { data, seats };
  } catch (error) {
    await discardPendingSave();

    window.alert(
      t('SavedGame.could-not-read', { error: (error as Error).message })
    );

    return null;
  }
};

// The seats handed over, or none: anything else in the slot is not ours to read.
const parseSeats = (stored: string | null): SeatChanges => {
  try {
    const parsed = stored === null ? null : JSON.parse(stored);

    return isSeatChanges(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/** A file picker, for a menu item to hang off. */
export const chooseSaveFile = (askSeats: AskSeats): void => {
  const input = document.createElement('input');

  input.type = 'file';
  input.accept = '.json,.gz,application/json,application/gzip';
  input.addEventListener('change', (): void => {
    const [file] = input.files ?? [];

    if (file) {
      // The player has already been told by the time this rejects; it is
      // rethrown for callers that want it, and there is no caller here.
      loadSaveFromFile(file, askSeats).catch((): void => {});
    }
  });

  input.click();
};
