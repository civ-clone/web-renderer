// The notifications the player has dismissed this turn (#416), by what they are about (`actionKey`): gone from the
//  notification rows and the Next Turn queue, and no longer holding back auto end turn. Only for the turn: a new turn
//  starts with none, and a notification that still applies comes back.

export class Dismissals {
  #keys = new Set<string>();
  #turn: number | null = null;

  #for(turn: number): Set<string> {
    if (turn !== this.#turn) {
      this.#keys = new Set();
      this.#turn = turn;
    }

    return this.#keys;
  }

  dismiss(key: string, turn: number): void {
    this.#for(turn).add(key);
  }

  has(key: string, turn: number): boolean {
    return turn === this.#turn && this.#keys.has(key);
  }
}

export default Dismissals;
