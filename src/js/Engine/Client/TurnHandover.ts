// Handing the player's turn to the UI and back (#449), moved out of `DataTransferClient.takeTurn`: the initial data,
//  the patch with the new turn, `turnStarted` and what was held for it, each `action` the UI sends acted on with its
//  patch and `actionHandled`, and `turnEnded`. An automated turn is played by automation's computer player instead.
//
// What goes out, in order: on the first turn `gameData`; 1 ms later the hand-over's patch, `turnStarted`, the
//  notifications held until then and the GoTos that halted (`unitHalted`). Per action, one patch, `actionHandled`, then
//  the halts; for `EndTurn`, one patch, `actionHandled` and `turnEnded`, and the turn is over 10 ms later. An `EndTurn`
//  sent while talks are open is answered as any other action is once they are over, and the turn goes on (#491). An
//  action that throws is answered too, with its patch, `actionHandled` and a `workerError`, and the turn goes on (#470).

import EventEmitter from '@dom111/typed-event-emitter/EventEmitter';
import Engine from '@civ-clone/core-engine/Engine';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import Tile from '@civ-clone/core-world/Tile';
import TransferObject from '../TransferObject';
import { TransportDisposer, TransportHandledAction } from '../Transport';
import Unit from '@civ-clone/core-unit/Unit';
import { ClientContext, Disposer, Registries } from './ClientContext';
import { filterToReference } from './refs';
import { describeError } from '../answer';

export type TurnHandoverContext = Pick<
  ClientContext,
  | 'player'
  | 'transport'
  | 'dataFilter'
  | 'actions'
  | 'patches'
  | 'notifier'
  | 'talks'
  // Read live, as it is turned on and off mid-game.
  | 'automation'
  // Acts on what the UI sends on `action` and says whether the turn is over: the client's own `handleAction`.
  | 'handleAction'
  // Both sent whole, in the initial data.
  | 'turn'
  | 'year'
> &
  Registries<{ difficulties: 'entries'; playerWorlds: 'getByPlayer' }>;

export class TurnHandover {
  // Stops the `action` receiver, for `dispose`.
  #actionDisposer: TransportDisposer | null;
  #context: TurnHandoverContext;
  // Set by `dispose`: a turn taken from then on is never handed over.
  #disposed: boolean = false;
  // Each `action` the UI sends, relayed to the listener of the turn under way.
  #eventEmitter: EventEmitter = new EventEmitter();
  // Whether the UI has been handed this player's turn: `turnStarted` is sent and `action`s are listened for. Until then,
  //  our own notifications are held (see `holdsNotifications`).
  #handedOver: boolean = false;
  // The hand-over 1 ms after the turn is taken, until it runs, for `dispose` to stop.
  #handOverTimer: ReturnType<typeof setTimeout> | null = null;
  // GoTos that stopped next to a choice (#357), sent once the patch with the unit's move has gone, or with
  //  `turnStarted` for one carried on at the start of the turn.
  #heldHalts: { target: string; unit: string }[] = [];
  // The listener of the turn under way, which acts on each `action`, for `dispose`.
  #listener: ((...args: any[]) => Promise<void>) | null = null;
  #sentInitialData: boolean = false;

  constructor(context: TurnHandoverContext) {
    this.#context = context;

    this.#actionDisposer = context.transport.receive(
      'action',
      (...args): void => this.#eventEmitter.emit('action', ...args)
    );
  }

  // Stops listening for the UI's `action`s, and a turn under way played by hand stops acting on them, so it never ends.
  //  A hand-over still to come is called off, and a turn taken from then on sends nothing and never ends either. What
  //  is already under way goes on: an action being handled, a turn's end 10 ms after `turnEnded`, and an automated turn,
  //  which still sends its whole-player patch and ends once automation's client has played it.
  dispose(): void {
    this.#disposed = true;

    if (this.#handOverTimer !== null) {
      clearTimeout(this.#handOverTimer);
      this.#handOverTimer = null;
    }

    this.#actionDisposer?.();
    this.#actionDisposer = null;

    if (this.#listener !== null) {
      this.#eventEmitter.off('action', this.#listener);
      this.#listener = null;
    }
  }

  get handedOver(): boolean {
    return this.#handedOver;
  }

  // Whether a notification given now waits for the hand-over: on our own turn, by hand, until it is handed over. Read
  //  as each one is given, as is automation.
  holdsNotifications(): boolean {
    // Before the initial data the UI isn't listening for them, as after a load that resumes a computer player's turn
    //  (#151): they go once it has been sent.
    if (!this.#sentInitialData) {
      return true;
    }

    if (this.#handedOver || this.#context.automation.enabled) {
      return false;
    }

    return this.#context.automation.ourTurn();
  }

  sendInitialData(): void {
    // Through the visibility filter, as every patch is. Sent as it was, `toPlainObject` was called on it with no filter, so
    //  every other player went out in full, and with them their `world`: every tile each civilization knows. Reached from
    //  our units' and cities' `player`/`originalPlayer`, a tile's `units`/`city`/`workedBy` and a unit's actions (#328).
    this.#context.transport.send(
      'gameData',
      new TransferObject(
        this.#context.player(),
        this.#context.turn,
        this.#context.year,
        this.#context.difficulties.entries()[0] ?? null
      ).toPlainObject(
        this.#context.dataFilter(undefined, { tilesInFull: true })
      )
    );

    this.#sentInitialData = true;

    // What was held for it, unless it is still held for the hand-over.
    if (!this.holdsNotifications()) {
      this.#context.notifier.release();
    }
  }

  // A GoTo that stopped next to a choice (#357): the unit goes with its actions, for the UI to choose from, and the UI
  //  is told once the patch with it has gone.
  unitHalted(unit: Unit, target: Tile): void {
    if (
      unit.player() !== this.#context.player() ||
      this.#context.automation.enabled
    ) {
      return;
    }

    const playerTile = this.#context.playerWorlds
      .getByPlayer(this.#context.player())
      .getByTile(target);

    if (!playerTile) {
      return;
    }

    // Its actions go out with it, for the UI to choose from.
    this.#setUnitWithActions(unit);
    this.#context.patches.unit(unit);

    this.#heldHalts.push({ target: playerTile.id(), unit: unit.id() });
  }

  // The UI has actions for one unit (#323). When that changes, the unit that had them goes again without them.
  #setUnitWithActions(unit: Unit | null): void {
    this.#context.actions.setUnitWithActions(unit, (previous) =>
      this.#context.patches.unit(previous)
    );
  }

  #handOver(): void {
    this.#handedOver = true;

    this.#context.transport.send('turnStarted', null);

    this.#context.notifier.release();

    this.#sendHalts();

    this.#context.talks.handOver();
  }

  // Says an action has been handled, once the patch with its result has gone (#326). An action's patch can't be told
  //  from any other by what is in it (a `unitActions` answer can arrive first, with the unit where it was), so the UI
  //  waits for this to know a move it has drawn ahead was refused.
  #acknowledge({ name, id, unitAction, target }: TransportHandledAction): void {
    this.#context.transport.send('actionHandled', {
      name,
      id,
      unitAction,
      target,
    });
  }

  #sendHalts(): void {
    this.#heldHalts
      .splice(0)
      .forEach((halt) => this.#context.transport.send('unitHalted', halt));
  }

  takeTurn(): Promise<void> {
    const { automation, patches, turn, year } = this.#context;

    return new Promise<void>((resolve, reject): void => {
      // A client done with sends nothing more (`dispose`).
      if (this.#disposed) {
        return;
      }

      // The first turn after a load or a new game: the initial data is the player's whole state, so the hand-over
      //  below has no need to queue and send it a second time.
      const playerJustSent = !this.#sentInitialData;

      if (playerJustSent) {
        this.sendInitialData();
      }

      if (automation.enabled) {
        // Automation's own client does the talking.
        this.#context.talks.metOnTheWay.clear();
        this.#heldHalts.splice(0);

        automation.client
          .takeTurn()
          .then(() => {
            patches.update(turn.id(), () => turn.toPlainObject());
            patches.update(year.id(), () => year.toPlainObject());
            patches.wholePlayer(
              filterToReference(PlayerWorld, PlayerTile, Tile)
            );

            patches.flush();
            resolve();
          })
          .catch(reject);

        return;
      }

      this.#handOverTimer = setTimeout(() => {
        this.#handOverTimer = null;

        patches.update(turn.id(), () => turn.toPlainObject());
        patches.update(year.id(), () => year.toPlainObject());

        // On later turns this is how the UI gets the new turn's actions.
        if (!playerJustSent) {
          patches.wholePlayer(
            filterToReference(PlayerWorld, PlayerTile, Tile),
            'add'
          );
        }

        patches.flush();

        // Attached here, not when the turn is taken, so the UI can act from here and not before: an `EndTurn` sent in
        //  answer to the last turn's final patch (auto end of turn sees End Turn as the only thing left) would
        //  otherwise end this turn before it was handed over, and `turnStarted` would follow `turnEnded` (#151).
        this.#listener = listener;
        this.#eventEmitter.on('action', listener);

        this.#handOver();
      }, 1);

      const listener = async (...args: any[]): Promise<void> => {
        // How far the action got, for when something throws (#470): the turn's end, once it is decided, and the answer
        //  and `turnEnded`, once they have gone.
        let playerState: ReturnType<typeof patches.playerState> | null = null,
          ended = false,
          acknowledged = false,
          turnEndedSent = false;

        const acknowledge = (): void => {
          this.#acknowledge(args[0]);

          acknowledged = true;
        };

        // An `EndTurn` sent while talks are open is refused (#491).
        const waitedForTalks =
          args[0]?.name === 'EndTurn' && this.#context.talks.underWay;

        try {
          playerState = patches.playerState();

          // Every flush is held while the action is handled (#321). `hold` is `async`, so what follows runs a microtask
          //  after the hold is let go, one later than when the listener let go of it itself (before #518): a patch then
          //  `actionHandled` on the 4th microtask after a unit's action, not the 3rd, and the 2nd after `EndTurn`, not
          //  the 1st. Nothing runs in that gap. Kept as it is, `tests/engine/clientTurnHandover.ts` counts them (#503).
          const turnEnded = await patches.hold(() =>
            this.#context.handleAction(...args)
          );

          if (turnEnded) {
            ended = true;

            this.#eventEmitter.off('action', listener);

            if (this.#listener === listener) {
              this.#listener = null;
            }

            this.#handedOver = false;

            patches.flush();

            acknowledge();

            this.#context.transport.send('turnEnded', null);

            turnEndedSent = true;

            setTimeout(() => resolve(), 10);

            return;
          }

          // Not the whole player, which in a large game is hundreds of KB and most of the time an action takes: what
          //  the action changed has been sent by now, by the action and the events it raised, and the player's actions
          //  are sent if they changed (#411). And its research and treasury if the action changed them on the way.
          patches.playerStateChanged(playerState);
          patches.actions();

          patches.flush();

          acknowledge();

          this.#sendHalts();

          // An `EndTurn` refused, as while talks are open (#491): the UI's auto end of turn waits for its answer before
          //  it sends another (#151), and so looks again only at the next patch, which goes after the answer.
          if (waitedForTalks) {
            patches.flush();
          }
        } catch (e) {
          // Rejected, the turn ended without a word to the UI: no `actionHandled`, so a move drawn ahead never settled,
          //  and no `turnEnded` (#470). What the action changed before it threw is sent, with the player's actions as
          //  they are now, the UI is told it has been handled and that something went wrong, and the next action is
          //  listened for as any other. A turn that had ended still ends. Each step on its own, so one that throws
          //  doesn't stop the rest. An `EndTurn` that threw gets no second patch after its answer, which only an
          //  `EndTurn` refused for talks needs: auto end of turn would send it again, and it would throw again.
          const attempt = (step: () => void): void => {
            try {
              step();
            } catch (error) {
              console.error(error);
            }
          };

          console.error(e);

          if (!ended) {
            if (playerState !== null) {
              const before = playerState;

              attempt(() => patches.playerStateChanged(before));
            }

            attempt(() => patches.actions());
          }

          attempt(() => patches.flush());

          if (!acknowledged) {
            attempt(acknowledge);
          }

          attempt(() =>
            this.#context.transport.send('workerError', {
              message: describeError(e),
            })
          );

          if (ended) {
            if (!turnEndedSent) {
              attempt(() => this.#context.transport.send('turnEnded', null));
            }

            setTimeout(() => resolve(), 10);
          }
        }
      };
    });
  }
}

// A GoTo that stopped next to a choice (#357). Registered where the client registered it: after the talks' `unit:moved`
//  listener and before the patches'.
export const registerTurnHandoverEvents = (
  engine: Pick<Engine, 'on' | 'off'>,
  turnHandover: TurnHandover
): Disposer => {
  const listener = (unit: Unit, target: Tile): void =>
    turnHandover.unitHalted(unit, target);

  engine.on('unit:halted', listener);

  return () => engine.off('unit:halted', listener);
};

export default TurnHandover;
