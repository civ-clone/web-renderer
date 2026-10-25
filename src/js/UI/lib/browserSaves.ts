import { Store } from '../Store';

/**
 * Saved games, kept in the browser (#653): the ones the player saves, the one each new game keeps as it starts, and
 * the autosave taken every few turns.
 *
 * The player's own and each game's start are kept until they are deleted, and any can be downloaded as a file from
 * Load Game. Only the newest autosave is kept, so a crash or a closed tab costs a few turns rather than the game; it
 * is let go only once the next is in, so a bad write never leaves none.
 *
 * What is kept is the file as a download would be, gzipped where the browser can, as a Blob: IndexedDB structured-clones
 * what it is given, and a Blob is copied cheaply where the 15–30MB of JSON inside a late game's save would not be.
 */
/** Who saved it: the player, the game as it started, or the autosave every few turns. */
export type SaveKind = 'player' | 'start' | 'autosave';

export type BrowserSave = {
  // As a download is named: the civilization, the turn and the date.
  name: string;
  // When it was kept, in ms since the epoch, which is also its key.
  savedAt: number;
  kind: SaveKind;
  data: Blob;
};

type BrowserSaves = {
  saves: {
    key: number;
    value: BrowserSave;
  };
};

/** How many autosaves are kept: the newest, and no others. */
export const KEEP_AUTOSAVES = 1;

let store: Store<BrowserSaves> | null = null;

const savesStore = (): Store<BrowserSaves> => {
  if (store === null) {
    store = new Store<BrowserSaves>('civ-clone-saves', 'saves');
  }

  return store;
};

let persistRequested = false;

// Once a session, and only for a browser that has the call: without it the saves are as likely to be evicted as any
//  other site data, which is no reason not to keep them.
const requestPersistence = async (): Promise<void> => {
  if (persistRequested) {
    return;
  }

  persistRequested = true;

  try {
    const storage = globalThis.navigator?.storage;

    if (storage?.persist && !(await storage.persisted?.())) {
      await storage.persist();
    }
  } catch {
    // Asked, and refused or unable to say: the saves are kept all the same.
  }
};

/** Every save kept, newest first. Storage that can't be read has none to offer. */
export const listSaves = async (): Promise<BrowserSave[]> => {
  try {
    const saves: BrowserSave[] = await savesStore().getAll();

    return saves.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
};

/** Lets a save go, by when it was kept. */
export const deleteSave = async (savedAt: number): Promise<void> => {
  await savesStore().delete(savedAt);
};

/**
 * Keeps a save, and lets go of all but the newest `KEEP_AUTOSAVES` autosaves. Storage that is full or refused is said
 * through `report` rather than thrown, and the save is not kept: it settles `false`.
 */
export const keepSave = async (
  name: string,
  data: Blob,
  kind: SaveKind,
  report: (error: Error) => void,
  now: () => number = Date.now
): Promise<boolean> => {
  try {
    const saves = savesStore(),
      savedAt = now(),
      save: BrowserSave = { name, savedAt, kind, data };

    // The autosaves past the newest `keep` let go. The rest are the player's to delete.
    const prune = async (keep: number): Promise<void> => {
      const autosaves = (await saves.getAll())
        .filter(({ kind }) => kind === 'autosave')
        .sort((a, b) => b.savedAt - a.savedAt);

      await Promise.all(
        autosaves.slice(keep).map(({ savedAt }) => saves.delete(savedAt))
      );
    };

    await requestPersistence();

    try {
      await saves.set(save, savedAt);
    } catch {
      // Storage that is full stays full if the oldest autosave is only let go once the newest save is in: let it go
      //  first, and try once more. The newer autosaves are still kept meanwhile.
      const autosaves = (await saves.getAll()).filter(
        ({ kind }) => kind === 'autosave'
      ).length;

      await prune(Math.max(0, autosaves - 1));
      await saves.set(save, savedAt);
    }

    await prune(KEEP_AUTOSAVES);

    return true;
  } catch (error) {
    report(error as Error);

    return false;
  }
};

/**
 * How often to autosave, as the Options window offers it: once as a new game starts, then every 5, 10 or 20 turns as
 * well, or never.
 */
export const AUTOSAVE_CHOICES = ['start', '5', '10', '20', 'off'] as const;

export type AutosaveChoice = (typeof AUTOSAVE_CHOICES)[number];

/**
 * What to save as a turn is handed over, if anything. Unless autosave is off, a new game keeps a save of its first
 * turn (`start`), and then an `autosave` every 5, 10 or 20 turns where that is chosen. A loaded game is not saved as
 * it resumes: it is already a save, and one loaded from the autosave would otherwise replace it with a copy of itself.
 */
export const autosaveDue = (
  turn: number,
  choice: string,
  { firstOfSession, newGame }: { firstOfSession: boolean; newGame: boolean }
): 'start' | 'autosave' | null => {
  if (
    !(AUTOSAVE_CHOICES as readonly string[]).includes(choice) ||
    choice === 'off'
  ) {
    return null;
  }

  if (firstOfSession) {
    return newGame ? 'start' : null;
  }

  const every = Number(choice);

  return Number.isInteger(every) && turn % every === 0 ? 'autosave' : null;
};
