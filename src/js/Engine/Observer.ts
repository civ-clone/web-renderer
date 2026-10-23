import DataTransferClient from './DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import Transport, { TransportDisposer } from './Transport';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import isBarbarian from '@civ-clone/base-civilization-barbarian/isBarbarian';

/** A player as the observer lists them: by id, with the civilization and leader class names for the page to name. */
export type ObservedPlayer = {
  id: string;
  civilization: string;
  leader: string | null;
};

/** What the page is told whenever the observer's view or the game's pace changes. */
export type ObserverState = {
  players: ObservedPlayer[];
  // The player whose game the page sees, as that player sees it.
  viewing: string | null;
  // Whether the turns are held between turns.
  paused: boolean;
};

/**
 * Watches a game nobody on this page plays (#607): the page sees the game as one of its players does, through a
 * read-only `DataTransferClient` for that player, and can hold the turns between turns and let them go again. It has
 * no player of its own and no say in the game, and it isn't in the `ClientRegistry`: each player's own client plays.
 *
 * The page is sent `observer` with the players to choose from, then the viewed player's `gameData`, and `turnEnded`,
 * which puts the page in its waiting state (no unit activates, nothing is sent as an action). As each turn ends the
 * viewed player is sent whole again, as a hand-over would send it, so the turn's growth and research show.
 */
export class Observer {
  #client: DataTransferClient | null = null;
  #disposers: (TransportDisposer | (() => void))[] = [];
  #paused: boolean = false;
  #transport: Transport<TransportDataMap>;
  #viewing: Player | null = null;

  constructor(transport: Transport<TransportDataMap>) {
    this.#transport = transport;

    const on = (event: string, listener: (...args: any[]) => void): void => {
      engine.on(event, listener);

      this.#disposers.push(() => engine.off(event, listener));
    };

    this.#disposers.push(
      transport.receive('observe', ({ playerId }): void =>
        this.observe(playerId)
      ),
      transport.receive('pause', (): void => this.pause()),
      transport.receive('resume', (): void => this.resume())
    );

    // The players have their civilizations once the game starts: the first is watched until the page chooses.
    on('game:start', (): void => this.observeFirst());

    // A player gone, or one come back (#178): the list to choose from changes. The barbarians (#169) aren't on it.
    on('player:defeated', (player: Player): void => {
      if (player === this.#viewing) {
        this.observeFirst();

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

  /** The player whose game the page sees, for what names the other players by whether they've met. */
  player(): Player | null {
    return this.#viewing;
  }

  paused(): boolean {
    return this.#paused;
  }

  /** See the game as its first civilization does: at the start, or when the one watched is gone. */
  observeFirst(): void {
    const [first] = this.#players();

    this.observe(first?.id() ?? null);
  }

  /** See the game as `playerId` does, from now on. A player not in the game to be seen as leaves the view as it is. */
  observe(playerId: string | null): void {
    const player =
      this.#players().find(
        (candidate: Player) => candidate.id() === playerId
      ) ?? null;

    if (player === null) {
      this.#sendState();

      return;
    }

    this.#client?.dispose();
    this.#viewing = player;
    // Automation on, though its turn is never taken: a client playing by hand sends each move of its own units as
    //  it happens, which the whole player sent as each turn ends covers (#320).
    this.#client = new DataTransferClient(player, this.#transport, {
      automationEnabled: true,
      readOnly: true,
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
      viewing: this.#viewing?.id() ?? null,
      paused: this.#paused,
    });
  }
}

export default Observer;
