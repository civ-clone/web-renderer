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

export const fileName = (name: string): string =>
  `${name.replace(/[^a-z\d _-]/gi, '').trim() || 'civ-clone'}.civ-clone.json`;

export const downloadSave = (name: string, data: string): void => {
  const blob = new Blob([data], { type: 'application/json' }),
    url = URL.createObjectURL(blob),
    anchor = document.createElement('a');

  // Not `s()`: this needs an object URL on `href`, and it is never in the
  // document — it is clicked and dropped.
  anchor.href = url;
  anchor.download = fileName(name);
  anchor.click();

  // After the click, so the download has the URL it was given.
  setTimeout((): void => URL.revokeObjectURL(url), 10000);
};

/** Reads a save the player chose, and reloads into it. */
export const loadSaveFromFile = (file: File): Promise<void> =>
  file.text().then((data: string): void => {
    try {
      const parsed = JSON.parse(data);

      if (
        typeof parsed?.format !== 'number' ||
        !Array.isArray(parsed.entities)
      ) {
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
  });

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
  input.accept = '.json,application/json';
  input.addEventListener('change', (): void => {
    const [file] = input.files ?? [];

    if (file) {
      loadSaveFromFile(file);
    }
  });

  input.click();
};
