import {
  Coordinate,
  GameData,
  PlayerAction,
  Tile,
  Unit,
  UnitAction,
} from '../types';
import { TransportHandledAction } from '../../Engine/Transport';
import Transport from '../Transport';
import { directionKeys, keyToActionsMap } from '../lib/unitActionKeys';
import chooseActiveUnit from '../lib/chooseActiveUnit';
import UnitQueue from '../lib/UnitQueue';
import { openArrivalWindow } from '../lib/unitActionPrompts';
import HaltedUnits from '../lib/haltedUnits';
import {
  UnitActionsRequest,
  hasUnitActions,
  unitActions,
} from '../lib/unitActions';
import ActiveUnitTiles from '../lib/ActiveUnitTiles';
import PendingMove from '../lib/PendingMove';
import playUnitKey, { PlayedKey } from '../lib/playUnitKey';
import { Topology } from '../lib/topologyFor';

// The active unit: which one it is, what the map layers and the unit details show for it, and what a unit key or one
//  of its buttons does to it, typed now or kept while a move or another order is answered (#326, #543).
//
// Reaches into `document` in one place: `drain` leaves the kept keys to a modal window, or a window with the focus,
//  as a key typed now would be (`dialog.window.modal[open]`, `document.activeElement`).

/** What the controller needs of the map portal (`GamePortal`). */
export interface ActiveUnitPortal {
  isVisible(x: number, y: number, margin?: number): boolean;
  render(): void;
  setActiveUnit(unit: Unit | null): void;
  setCenter(x: number, y: number): void;
}

/** What the controller needs of the units layer (`Units`). */
export interface ActiveUnitUnitsLayer {
  setActiveUnit(unit: Unit | null, pendingTile?: Coordinate | null): void;
  setVisible(visible: boolean): void;
  update(tiles: Tile[]): void;
}

/** What the controller needs of the active unit's layer (`ActiveUnit`). */
export interface ActiveUnitLayer {
  render(): void;
  setActiveUnit(unit: Unit | null, pendingTile?: Coordinate | null): void;
  setVisible(visible: boolean): void;
}

export type ActiveUnitControllerDeps = {
  activeUnitLayer: ActiveUnitLayer;
  // Once a halted unit's window has closed, chosen or dismissed (#357).
  arrivalClosed: () => void;
  // Read when an action is acknowledged, so always the latest rebuild.
  data: () => GameData;
  haltedUnits: HaltedUnits;
  options: { get(key: string, defaultValue?: any): any };
  // The tests keep their own, to look at what is kept. Otherwise made here.
  pendingMove?: PendingMove<Tile>;
  portal: ActiveUnitPortal;
  scheduleRender: () => void;
  // Builds the unit details panel for `unit` (`UnitDetails`).
  showUnitDetails: (unit: Unit | null) => void;
  transport: Pick<Transport, 'send'>;
  unitsLayer: ActiveUnitUnitsLayer;
  // `topology` for the keys that move a unit: one per direction the world has (#88).
  world: { get(x: number, y: number): Tile; topology(): Topology };
};

export class ActiveUnitController {
  #activeUnit: Unit | null = null;
  // Collected in `apply`, which is the only point that still knows the
  // outgoing unit — by the time the coalesced `render` runs, `lastUnit` has
  // already been pointed at the incoming one.
  #activeUnitTiles = new ActiveUnitTiles();
  #deps: ActiveUnitControllerDeps;
  #lastUnit: Unit | null = null;
  // A move drawn before the engine has answered it, and the keys typed
  // while it is (#326).
  #pendingMove: PendingMove<Tile>;
  // The worker sends a unit's actions only once asked for them (#323).
  #unitActionsRequest: UnitActionsRequest;
  // The units that can act this turn, and those deferred with `w` (wait).
  #unitQueue = new UnitQueue();
  // Whether the turn has been ended and the game is waiting for the next one, as the last rebuild said.
  #waiting = false;

  constructor(deps: ActiveUnitControllerDeps) {
    this.#deps = deps;
    this.#pendingMove = deps.pendingMove ?? new PendingMove<Tile>();
    this.#unitActionsRequest = new UnitActionsRequest((unitId) =>
      deps.transport.send('unitActions', unitId)
    );
  }

  /**
   * A unit's action button (#348): the action of that name the active unit has now, sent as its key would send it and
   * waited for as any order is (#543). Nothing when the button was drawn for a unit that is no longer active, or while
   * a move or an order is answered or keys are kept: the button was drawn for the unit as it was before them.
   */
  act(unitId: string, actionName: string): boolean {
    const unit = this.#activeUnit,
      pendingMove = this.#pendingMove;

    if (
      unit === null ||
      unit.id !== unitId ||
      pendingMove.pending() ||
      pendingMove.queued()
    ) {
      return false;
    }

    const [action] = unitActions(unit).filter(
      (action): boolean => action._ === actionName
    );

    if (!action) {
      return false;
    }

    this.#send(unit.id, action);

    return true;
  }

  active(): Unit | null {
    return this.#activeUnit;
  }

  // The move drawn before its answer (#326), settled by its own
  // acknowledgement, which follows the patch with its result: any
  // other patch, the answer to a `unitActions` request say, can come
  // first with the unit still on the tile it left. Arrived, it is
  // where it was drawn. Refused (a zone of control, no moves left),
  // it goes back to the tile it left, and the keys typed after it go
  // too: they were typed for a unit that didn't move.
  //
  // Any other order is settled by its own acknowledgement too (#543), and
  // the keys typed since are played against whichever unit is up now, the
  // one that acted or the next.
  actionHandled(action: TransportHandledAction): void {
    const pendingMove = this.#pendingMove;

    if (pendingMove.orderAnsweredBy(action)) {
      pendingMove.settleOrder();

      this.drain();

      return;
    }

    if (!pendingMove.answeredBy(action)) {
      return;
    }

    const arrived = pendingMove.settle(
      this.#deps.data().player.units.find((unit) => unit.id === action.id) ??
        null
    );

    if (!arrived) {
      pendingMove.clear();
    }

    this.apply(this.#activeUnit);

    this.#deps.scheduleRender();

    this.drain();
  }

  // Input-critical state only: keeps `activeUnit`/`lastUnit` and the map
  // layers' active-unit pointers current synchronously, so consecutive
  // moves of a multi-move unit always read the post-move tile. No render.
  apply(unit: Unit | null): void {
    const { activeUnitLayer, portal, unitsLayer } = this.#deps,
      pendingMove = this.#pendingMove;

    // The keys kept for one unit were meant for it, not the next (#326).
    pendingMove.activate(unit?.id ?? null);

    // While its move is answered, the unit is drawn on the tile it is
    // moving to.
    const pendingTile = pendingMove.destination(unit?.id ?? null);

    this.#activeUnitTiles.change(
      unit === null ? null : { tile: unit.tile, pendingTile }
    );

    this.#activeUnit = unit;

    portal.setActiveUnit(unit);
    unitsLayer.setActiveUnit(unit, pendingTile);
    activeUnitLayer.setActiveUnit(unit, pendingTile);

    if (unit !== null) {
      this.#lastUnit = unit;
      this.#unitQueue.activated(unit.id);
    }

    // Every way a unit becomes active comes through here: the next unit after an update, a click, the stack
    //  window and Wait.
    this.#unitActionsRequest.activate(unit);
  }

  /** The keys kept while a move or an order is answered are forgotten, the move or order itself is not. */
  clearKeys(): void {
    this.#pendingMove.clearKeys();
  }

  /** New data has arrived: a unit's actions asked for and not yet in are asked for again. */
  dataReceived(): void {
    this.#unitActionsRequest.dataReceived();
  }

  // Plays the keys kept while the last move or order was answered, each
  // read against the unit as the answer left it, as if typed now.
  drain(): void {
    const activeUnit = this.#activeUnit,
      pendingMove = this.#pendingMove;

    if (
      activeUnit === null ||
      !hasUnitActions(activeUnit) ||
      !pendingMove.queued()
    ) {
      return;
    }

    // A window the answer opened (a hut's news, talks) has the
    // keys now, as it would a key typed now: the rest were typed
    // without knowing it would be there.
    if (
      document.querySelector('dialog.window.modal[open]') !== null ||
      document.activeElement?.closest('dialog.window')
    ) {
      pendingMove.clear();

      return;
    }

    pendingMove.drain((key) => {
      const played = this.#playUnitKey(key);

      // So does one a key opened, to confirm an attack, say.
      if (played === 'prompted') {
        pendingMove.clear();
      }

      return played !== null;
    });
  }

  /**
   * After a rebuild: takes the player's `actions`, and makes the next unit active, a halted one first, offering it its
   * arrival window.
   */
  next(actions: PlayerAction[], waiting: boolean): void {
    const { haltedUnits, portal } = this.#deps,
      unitQueue = this.#unitQueue;

    this.#waiting = waiting;

    // The turn is over: an order sent as it ended is never answered, as the worker has stopped listening, and the keys
    //  kept were for this turn (#543).
    if (waiting) {
      this.#pendingMove.release();
    }

    unitQueue.update(actions, waiting);

    const selectableActiveUnits = unitQueue.selectable();

    // A unit whose GoTo stopped next to a choice goes first, and is offered it once its actions are in.
    const halted = haltedUnits.next(unitQueue.units()),
      nextUnit =
        halted?.unit ??
        chooseActiveUnit(
          selectableActiveUnits,
          this.#lastUnit?.id ?? null,
          (x, y) => portal.isVisible(x, y)
        );

    if (halted?.actions?.length) {
      const unitId = halted.unit.id,
        arrival = openArrivalWindow(
          halted.unit,
          halted.actions,
          (chosen: UnitAction) => this.#send(unitId, chosen, true)
        );

      // Chosen or dismissed, the next halted unit is up once it closes.
      if (arrival !== null) {
        haltedUnits.opened();

        arrival.on('close', () => {
          haltedUnits.closed();

          this.#deps.arrivalClosed();
        });
      }
    }

    if (nextUnit === null) {
      this.#lastUnit = null;
    }

    this.apply(nextUnit);
  }

  /**
   * A unit key typed now: played, or kept while a move or another order is answered and played once it has been
   * (#326, #543). `false` when it is not a unit key, or there is no active unit.
   */
  pressKey(key: string): boolean {
    const activeUnit = this.#activeUnit;

    return !!(
      activeUnit &&
      (key in keyToActionsMap ||
        key in directionKeys(this.#deps.world.topology())) &&
      this.#pendingMove.press(
        key,
        hasUnitActions(activeUnit),
        (key) => this.#playUnitKey(key) !== null
      )
    );
  }

  // Display half: safe to defer/coalesce (canvas composites + unit info).
  render(unit: Unit | null): void {
    const { activeUnitLayer, options, portal, showUnitDetails, unitsLayer } =
      this.#deps;

    showUnitDetails(unit);

    // Only the tiles an active-unit change actually invalidated, rather
    // than a full-world re-render of the layer on every unit selection
    // and move. Every other tile reaches this layer the same way it
    // reaches the others, through `portal.build(tilesToRender)`.
    unitsLayer.update(this.#activeUnitTiles.take());

    unitsLayer.setVisible(true);
    activeUnitLayer.render();
    activeUnitLayer.setVisible(true);

    if (unit === null) {
      portal.render();

      return;
    }

    const tile = this.#pendingMove.destination(unit.id) ?? unit.tile;

    // A unit on the very edge of the map is visible but easily missed,
    // so it is brought back to the middle before it gets that far.
    if (!portal.isVisible(tile.x, tile.y, options.get('unitEdgeMargin', 0))) {
      portal.setCenter(tile.x, tile.y);
    }

    portal.render();
  }

  // For input call sites (unit selection/cycling), where immediate visual
  // feedback is wanted: apply state then render synchronously.
  set(unit: Unit | null): void {
    this.apply(unit);
    this.render(unit);
  }

  /**
   * The next turn is handed over (`turnStarted`): nothing sent before it is answered any more, so no move or order is
   * waited for, and no key kept (#543).
   */
  turnStarted(): void {
    this.#waiting = false;

    this.#pendingMove.release();
  }

  /** `w`: the active unit waits, and the next unit is made active, if there is another. */
  wait(): void {
    const activeUnit = this.#activeUnit;

    if (activeUnit === null) {
      return;
    }

    const next = this.#unitQueue.wait(activeUnit);

    if (next !== null) {
      this.set(next);
    }
  }

  // What a unit key does to the active unit, typed now or kept while a move or an order was answered (#326, #543).
  #playUnitKey(key: string): PlayedKey {
    const { scheduleRender, transport, world } = this.#deps;

    return playUnitKey(key, this.#activeUnit, {
      apply: (unit) => this.apply(unit),
      pendingMove: this.#pendingMove,
      scheduleRender,
      send: (unitId, action, towardsTile) =>
        this.#send(unitId, action, towardsTile),
      transport,
      world,
    });
  }

  // Sends `action` for `unitId`, and keeps the keys typed after it until
  // its acknowledgement (#543): until then the unit is as it was before
  // it. Not for a plain move, drawn ahead and waited for as that (#326).
  // `towardsTile` for an order behind a direction key or an arrival
  // window: its keys are the unit's, as a move's are.
  //
  // Sent while waiting for the next turn (from a window left open over End
  // Turn), it is not waited for: the worker is not listening, so it is
  // never answered.
  #send(unitId: string, action: UnitAction, towardsTile = false): void {
    const order = { id: unitId, unitAction: action._, target: action.to.id };

    this.#deps.transport.send('action', { name: 'ActiveUnit', ...order });

    if (!this.#waiting) {
      this.#pendingMove.sent(order, towardsTile);
    }
  }
}

export default ActiveUnitController;
