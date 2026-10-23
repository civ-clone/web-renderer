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

// Any other order sent for a unit, as it was sent, and as its acknowledgement names it (#543).
export type Order = Required<
  Pick<TransportHandledAction, 'id' | 'unitAction'>
> &
  Pick<TransportHandledAction, 'target'>;

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
 *
 * Any other order sent (a unit key, a button, a choice in a window) is waited for too, until its own acknowledgement
 * (#543): until then the page still holds the unit as it was before the order, and a key read against it would be
 * sent for a unit that has already acted. The keys typed after an order for the unit's own tile (Fortify, Sentry, a
 * button) are for whichever unit is up once it is answered, the one that acted or the next, so another unit becoming
 * active keeps them while it is on its way. An order towards another tile (an attack, a choice on arriving) is a move
 * as far as the keys go: they were meant for the unit that made it, and another unit becoming active forgets them.
 */
export class PendingMove<T extends Destination = Destination, Key = string> {
  #keys: Key[] = [];
  #order: Order | null = null;
  // Whether the keys kept behind the order belong to its unit, as behind a move.
  #orderKeysForUnit = false;
  #to: T | null = null;
  #unitId: string | null = null;

  /**
   * The active unit is now `unitId`: a different unit forgets the last one's move and keys, but for the keys typed
   * since an order for its own tile that is still on its way, which are for whichever unit is up once it is answered.
   * An order towards another tile is forgotten with its keys, as a move is.
   */
  activate(unitId: string | null): void {
    if (unitId === this.#unitId) {
      return;
    }

    if (this.#order === null || this.#orderKeysForUnit) {
      this.#order = null;

      this.clear();
    } else {
      this.#to = null;
    }

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

  /** Forgets the move drawn ahead and the keys kept. An order on its way is still waited for. */
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

  /** Whether the engine has yet to answer a move drawn ahead or an order. */
  pending(): boolean {
    return this.#to !== null || this.#order !== null;
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
   * Forgets everything: the move, the order and the keys. For the end of the turn, after which nothing sent before it
   * is answered: an order sent as the turn ended never is, as the worker has stopped listening.
   */
  release(): void {
    this.#order = null;

    this.clear();
  }

  /** Whether `action`, which the engine says it has handled, is the order on its way (#543). */
  orderAnsweredBy({
    name,
    id,
    unitAction,
    target,
  }: TransportHandledAction): boolean {
    const order = this.#order;

    return (
      order !== null &&
      name === 'ActiveUnit' &&
      id === order.id &&
      unitAction === order.unitAction &&
      target === order.target
    );
  }

  /**
   * An order has been sent: keys are kept until it is answered (`orderAnsweredBy`, `settleOrder`). One sent before
   * then, from a window that was already open, replaces it: its answer is the one waited for, and every order is
   * answered. `keysForUnit` for an order towards another tile: the keys typed after it are forgotten if another unit
   * becomes active, as they are behind a move.
   */
  sent(order: Order, keysForUnit = false): void {
    this.#order = order;
    this.#orderKeysForUnit = keysForUnit;
  }

  /** The order has been answered: the keys kept are played against whichever unit is up now. */
  settleOrder(): void {
    this.#order = null;
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
