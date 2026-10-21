// When `Renderer`'s `updateState` prunes the object map: every 5th turn, or when the map has grown by half since the
//  last prune, and only once it holds over 5,000 objects. `pruneObjectMap` does the pruning; this keeps the counters.

export class PruneSchedule {
  #lastPrunedTurn = -1;
  #lastPrunedObjectCount: number;

  /** `objectCount` is the map's size when the game is first shown, the baseline for the growth check. */
  constructor(objectCount: number) {
    this.#lastPrunedObjectCount = objectCount;
  }

  due(turn: number, objectCount: number): boolean {
    const scheduledPrune =
        Number.isFinite(turn) &&
        turn > 0 &&
        turn % 5 === 0 &&
        turn !== this.#lastPrunedTurn,
      // Also prune on unexpected growth so the map can't balloon
      // within the 5-turn window between scheduled prunes.
      growthPrune = objectCount > this.#lastPrunedObjectCount * 1.5;

    return objectCount > 5000 && (scheduledPrune || growthPrune);
  }

  /** Records a prune made on `turn`, which left `objectCount` objects. */
  pruned(turn: number, objectCount: number): void {
    this.#lastPrunedTurn = turn;
    this.#lastPrunedObjectCount = objectCount;
  }
}

export default PruneSchedule;
