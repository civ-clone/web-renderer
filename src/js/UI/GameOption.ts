export class GameOption {
  #key: string;
  #value: any;

  constructor(key: string, value: any) {
    this.#key = key;
    this.#value = value;
  }

  key(): string {
    return this.#key;
  }

  value(): any {
    return this.#value;
  }
}

export default GameOption;
