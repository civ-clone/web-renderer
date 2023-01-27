import EntityRegistry from '@civ-clone/core-registry/EntityRegistry';
import GameOption from './GameOption';

export class GameOptionsRegistry extends EntityRegistry<GameOption> {
  constructor() {
    super(GameOption);
  }

  get(key: string): any {
    const [option] = this.getBy('key', key);

    if (!option) {
      return null;
    }

    return option.value();
  }

  set(key: string, value: any): void {
    const existing = this.getBy('key', key);
    if (existing.length) {
      this.unregister(...existing);
    }

    this.register(new GameOption(key, value));
  }
}

export const instance = new GameOptionsRegistry();

export default GameOptionsRegistry;
