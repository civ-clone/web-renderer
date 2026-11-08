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
