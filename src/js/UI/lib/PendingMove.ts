import { Coordinate, UnitAction } from '../types';
import { TransportHandledAction } from '../../Engine/Transport';

type UnitHolder<T extends Coordinate> = {
  id: string;
  tile: T;
};

// How many keys are kept while the engine answers. Enough for a held key to carry a unit as far as it can go in a
//  turn; keys past it are dropped rather than played long after they were typed.
const KEY_LIMIT = 8;

// The tile a move goes to: its id is what the move was sent with, and what its acknowledgement names.
type Destination = Coordinate & { id: string };

const sameTile = (a: Coordinate, b: Coordinate): boolean =>
  a.x === b.x && a.y === b.y;

/**
 * The action a direction key can show before the engine has answered: a plain move, the only thing to do that way.
 * An attack, or a move that comes with a choice (a Caravan's "Will you?", a Diplomat's arrival), waits for the
 * engine, since what it shows next depends on the answer.
 */
export const plainMove = (actions: UnitAction[]): UnitAction | null =>
  actions.length === 1 && actions[0]._ === 'Move' ? actions[0] : null;

/**
 * A move the frontend has drawn before the engine has answered it, and the keys typed while it is answered (#326).
 * Civ1 moves the unit on the keypress and buffers the keys after it. Here the worker's patch takes a frame or more,
 * and a key read in that time would act on the unit as it was: its old tile and the orders it had there.
 *
 * Everything belongs to one unit, the active one. Another unit becoming active forgets it all, as the keys were meant
 * for the last one.
 */
export class PendingMove<T extends Destination = Destination, Key = string> {
  #keys: Key[] = [];
  #to: T | null = null;
  #unitId: string | null = null;

  /** The active unit is now `unitId`: a different unit forgets the last one's move and keys. */
  activate(unitId: string | null): void {
    if (unitId === this.#unitId) {
      return;
    }

    this.clear();

    this.#unitId = unitId;
  }

  /**
   * Whether `action`, which the engine says it has handled, is the move drawn ahead. Only that says the move has been
   * answered: a patch can come first that has nothing to do with it, such as the answer to a `unitActions` request,
   * with the unit still on the tile it left.
   */
  answeredBy({ name, id, target }: TransportHandledAction): boolean {
    return (
      this.#to !== null &&
      name === 'ActiveUnit' &&
      id === this.#unitId &&
      target === this.#to.id
    );
  }

  clear(): void {
    this.#to = null;
    this.#keys = [];
  }

  /**
   * Forgets the keys kept, but not the move: it is still drawn ahead until it is answered. For a window that opens
   * before the answer, a negotiation the move started, say, which can close again before the answer arrives: the keys
   * were typed without knowing it would be there.
   */
  clearKeys(): void {
    this.#keys = [];
  }

  /** Where to draw `unitId` while its move is answered, or `null` to draw it where its data puts it. */
  destination(unitId: string | null): T | null {
    return unitId !== null && unitId === this.#unitId ? this.#to : null;
  }

  /**
   * Plays the keys typed while waiting, in order, one at a time. `play` says whether a key did anything: the first
   * that does is the last for now, as what it sent has to be answered before the next key can be read. A key that
   * does nothing any more is dropped.
   */
  drain(play: (key: Key) => boolean): void {
    while (!this.pending() && this.#keys.length > 0) {
      if (play(this.#keys.shift()!)) {
        return;
      }
    }
  }

  pending(): boolean {
    return this.#to !== null;
  }

  /**
   * A unit key, now: kept while a move is answered, behind keys already kept, or while the unit's orders are still
   * on their way (`ready` is false), and otherwise played straight away. Returns whether the key was taken.
   */
  press(key: Key, ready: boolean, play: (key: Key) => boolean): boolean {
    if (this.pending() || this.queued() || !ready) {
      this.queueKey(key);

      return true;
    }

    return play(key);
  }

  queued(): boolean {
    return this.#keys.length > 0;
  }

  /** Keeps `key` to play once the engine has answered. Past the limit it is dropped, and this returns false. */
  queueKey(key: Key): boolean {
    if (this.#keys.length >= KEY_LIMIT) {
      return false;
    }

    this.#keys.push(key);

    return true;
  }

  /**
   * The engine's answer is in (`answeredBy`): the move isn't pending any more, and the unit is drawn wherever its data
   * now puts it. Returns whether it arrived, false when it is still where it was (refused: a zone of control, no moves
   * left) or gone.
   */
  settle(unit: UnitHolder<Coordinate> | null): boolean {
    const to = this.#to;

    this.#to = null;

    return to !== null && unit !== null && sameTile(unit.tile, to);
  }

  /**
   * Draws `unitId` on `to` until the engine answers. The tile it leaves needs nothing kept: the unit's data still
   * puts it there, and is where it is drawn again if the move is refused.
   */
  start(unitId: string, to: T): void {
    this.activate(unitId);

    this.#to = to;
  }
}

export default PendingMove;
