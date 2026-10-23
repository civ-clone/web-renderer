import DataTransferClient from './DataTransferClient';
import {
  ObserverChoice,
  ObserverView,
  unionView,
  worldView,
} from './ObserverViews';
import Player from '@civ-clone/core-player/Player';
import Transport, { TransportDisposer } from './Transport';
import { View } from './Client/View';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import isBarbarian from '@civ-clone/base-civilization-barbarian/isBarbarian';
import registries from './Client/registries';

/** A player as the observer lists them: by id, with the civilization and leader class names for the page to name. */
export type ObservedPlayer = {
  id: string;
  civilization: string;
  leader: string | null;
};

/** What the page is told whenever the observer's view or the game's pace changes. */
export type ObserverState = {
  players: ObservedPlayer[];
  // What the page sees: some civilisations' game as they see it, or the whole map (#613).
  view: ObserverChoice;
  // Whether the turns are held between turns.
  paused: boolean;
};

/**
 * Watches a game nobody on this page plays (#607): the page sees the game as one or more of its players do, or the
 * whole map (#613), through a read-only `DataTransferClient`, and can hold the turns between turns and let them go
 * again. It has no player of its own and no say in the game, and it isn't in the `ClientRegistry`: each player's own
 * client plays.
 *
 * The page is sent `observer` with the players to choose from, then the view's `gameData`, and `turnEnded`, which
 * puts the page in its waiting state (no unit activates, nothing is sent as an action). As each turn ends the view's
 * player is sent whole again, as a hand-over would send it, so the turn's growth and research show.
 */
export class Observer {
  #client: DataTransferClient | null = null;
  #choice: ObserverChoice = { kind: 'players', playerIds: [] };
  #disposers: (TransportDisposer | (() => void))[] = [];
  #paused: boolean = false;
  #transport: Transport<TransportDataMap>;
  #view: ObserverView | null = null;
  #viewing: Player | null = null;

  constructor(transport: Transport<TransportDataMap>) {
    this.#transport = transport;

    const on = (event: string, listener: (...args: any[]) => void): void => {
      engine.on(event, listener);

      this.#disposers.push(() => engine.off(event, listener));
    };

    this.#disposers.push(
      transport.receive('observe', ({ view }): void => this.observe(view)),
      transport.receive('pause', (): void => this.pause()),
      transport.receive('resume', (): void => this.resume())
    );

    // The players have their civilizations once the game starts: the first is watched until the page chooses.
    on('game:start', (): void => this.observeFirst());

    // A player gone, or one come back (#178): the list to choose from changes, and a view that included the one gone
    //  is made again without them. The barbarians (#169) aren't on the list.
    on('player:defeated', (player: Player): void => {
      if (
        this.#choice.kind === 'players' &&
        this.#choice.playerIds.includes(player.id())
      ) {
        const left = this.#choice.playerIds.filter((id) => id !== player.id());

        if (left.length === 0) {
          this.observeFirst();
        } else {
          this.observe({ kind: 'players', playerIds: left });
        }

        return;
      }

      // The whole map shaped as the player gone: shaped as another from now on.
      if (this.#choice.kind === 'world' && player === this.#viewing) {
        this.observe({ kind: 'world' });

        return;
      }

      this.#sendState();
    });
    on('player:spawned', (player: Player): void => {
      if (!isBarbarian(player)) {
        this.#sendState();
      }
    });

    on('turn:end', (): void => this.#client?.refresh());
  }

  /** The player whose game the page sees, or the first of several, for what names the other players by whether they've met. */
  player(): Player | null {
    return this.#viewing;
  }

  /** The page's view, for what it may be told of other players (`hasMet`). */
  view(): View | null {
    return this.#view?.view ?? null;
  }

  paused(): boolean {
    return this.#paused;
  }

  /** See the game as its first civilization does: at the start, or when the ones watched are all gone. */
  observeFirst(): void {
    const [first] = this.#players();

    this.observe({
      kind: 'players',
      playerIds: first ? [first.id()] : [],
    });
  }

  /**
   * See the game as `choice` says, from now on: as some players do (together, when several), or the whole map. A
   * choice of players none of whom is in the game to be seen as leaves the view as it is.
   */
  observe(choice: ObserverChoice): void {
    const players = this.#players(),
      members =
        choice.kind === 'players'
          ? players.filter((player) => choice.playerIds.includes(player.id()))
          : [],
      // The whole map is shaped as the player last watched, or the first.
      primary =
        choice.kind === 'world'
          ? this.#viewing && players.includes(this.#viewing)
            ? this.#viewing
            : players[0] ?? null
          : members[0] ?? null;

    if (primary === null) {
      this.#sendState();

      return;
    }

    this.#client?.dispose();
    this.#view?.dispose();
    this.#choice =
      choice.kind === 'world'
        ? choice
        : { kind: 'players', playerIds: members.map((member) => member.id()) };
    this.#viewing = primary;
    // Before the client, whose own listener for newly seen squares looks them up in the view's world.
    this.#view =
      choice.kind === 'world'
        ? worldView(primary, registries)
        : members.length > 1
        ? unionView(members, registries)
        : null;
    // Automation on, though its turn is never taken: a client playing by hand sends each move of its own units as
    //  it happens, which the whole player sent as each turn ends covers (#320).
    this.#client = new DataTransferClient(primary, this.#transport, {
      automationEnabled: true,
      readOnly: true,
      view: this.#view?.view,
    });

    this.#sendState();
    this.#client.initialData();
    // The page waits as it does between its own turns: it looks, and acts on nothing.
    this.#transport.send('turnEnded', null);
  }

  /** Hold the turns: the turn under way finishes, and the next waits (`turn:hold`, core-turn-based-game). */
  pause(): void {
    if (this.#paused) {
      return;
    }

    this.#paused = true;
    engine.emit('turn:hold');
    this.#sendState();
  }

  resume(): void {
    if (!this.#paused) {
      return;
    }

    this.#paused = false;
    engine.emit('turn:release');
    this.#sendState();
  }

  dispose(): void {
    this.#client?.dispose();
    this.#client = null;
    this.#view?.dispose();
    this.#view = null;
    this.#disposers.splice(0).forEach((dispose) => dispose());
  }

  // The players the game can be seen as: not the barbarians (#169), who are nobody's civilization.
  #players(): Player[] {
    return playerRegistryInstance
      .entries()
      .filter((player: Player) => !isBarbarian(player));
  }

  #sendState(): void {
    this.#transport.send('observer', {
      players: this.#players().map(
        (player: Player): ObservedPlayer => ({
          id: player.id(),
          civilization: typeNameOf(player.civilization().sourceClass()),
          leader: (() => {
            const leader = player.civilization().leader();

            return leader === null ? null : typeNameOf(leader.sourceClass());
          })(),
        })
      ),
      view: this.#choice,
      paused: this.#paused,
    });
  }
}

export default Observer;
