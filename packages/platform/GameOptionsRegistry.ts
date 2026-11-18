import EntityRegistry from '@civ-clone/core-registry/EntityRegistry';
import GameOption from './GameOption';

export type OptionStorage = Pick<Storage, 'getItem' | 'setItem'>;

const storageKey = 'gameOptions';

/**
 * The client options a player can change. Only values the player has set are kept in browser storage (#343): the
 *  defaults stay in code, so changing one there still reaches players who never touched it. They are per-browser
 *  conveniences, not part of a game, so blocked or unreadable storage just means the defaults.
 */
export class GameOptionsRegistry extends EntityRegistry<GameOption> {
  #storage: () => OptionStorage | null;
  // What's told of each option registered again, by key: by `defaults` or `set`.
  #changeHandlers = new Set<(key: string) => void>();

  constructor(
    storage: () => OptionStorage | null = () => globalThis.localStorage ?? null
  ) {
    super(GameOption);

    this.#storage = storage;
  }

  #stored(): { [key: string]: any } {
    try {
      const stored = JSON.parse(this.#storage()?.getItem(storageKey) ?? '{}');

      return stored !== null &&
        typeof stored === 'object' &&
        !Array.isArray(stored)
        ? stored
        : {};
    } catch {
      return {};
    }
  }

  #register(key: string, value: any): void {
    const existing = this.getBy('key', key);

    if (existing.length) {
      this.unregister(...existing);
    }

    this.register(new GameOption(key, value));

    // Each told whatever another does: one that throws (the map's art failing to draw, #1118) would otherwise keep the
    //  rest from hearing, and `set` from keeping the value.
    this.#changeHandlers.forEach((handler) => {
      try {
        handler(key);
      } catch (error) {
        console.error(`An option's change handler failed for ${key}.`, error);
      }
    });
  }

  /**
   * Calls `handler` with an option's key whenever it is given a value, by `defaults` or `set`. Returns what stops it,
   *  for a handler that lives no longer than a game or a window.
   */
  onChange(handler: (key: string) => void): () => void {
    this.#changeHandlers.add(handler);

    return (): void => {
      this.#changeHandlers.delete(handler);
    };
  }

  /** Registers each option, using the stored value where there is one of the same kind as the default. */
  defaults(values: { [key: string]: any }): void {
    const stored = this.#stored();

    Object.entries(values).forEach(([key, value]) => {
      const storedValue = stored[key],
        sameKind =
          storedValue !== undefined &&
          storedValue !== null &&
          typeof storedValue === typeof value &&
          Array.isArray(storedValue) === Array.isArray(value);

      this.#register(key, sameKind ? storedValue : value);
    });
  }

  /**
   * Moves each stored value whose key `renamed` gives a new key for to that key, and forgets the old one: an option
   *  that has been renamed keeps what the player chose. A value already stored under the new key is kept instead. Run
   *  before `defaults`, at every start: once the old keys are gone there's nothing more to move.
   */
  rename(renamed: (key: string) => string | null): void {
    try {
      const storage = this.#storage(),
        stored = this.#stored();
      let changed = false;

      Object.keys(stored).forEach((key) => {
        const to = renamed(key);

        if (to === null || to === key) {
          return;
        }

        if (!(to in stored)) {
          stored[to] = stored[key];
        }

        delete stored[key];
        changed = true;
      });

      if (changed) {
        storage?.setItem(storageKey, JSON.stringify(stored));
      }
    } catch {
      // Storage is blocked or full: the defaults apply, as they would anyway.
    }
  }

  get(key: string, defaultValue: any = null): any {
    const [option] = this.getBy('key', key);

    if (!option) {
      return defaultValue;
    }

    return option.value();
  }

  set(key: string, value: any): void {
    this.#register(key, value);

    try {
      this.#storage()?.setItem(
        storageKey,
        JSON.stringify({ ...this.#stored(), [key]: value })
      );
    } catch {
      // Storage is blocked or full: the option still applies until the page is reloaded.
    }
  }
}

export const instance = new GameOptionsRegistry();

export default GameOptionsRegistry;
