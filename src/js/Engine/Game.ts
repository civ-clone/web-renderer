import Client from '@civ-clone/core-client/Client';
import DataTransferClient from './DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import { SaveGame } from '@civ-clone/core-save-game/SaveGame';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Transport from './Transport';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import answer, { describeError } from './answer';
import loadGame from './loadGame';
import {
  SeatChanges,
  isSeatChanges,
  seatFromDescriptor,
} from './lib/savedSeats';
import Observer from './Observer';
import { plugins } from '../plugins';
import { registerDiplomacyClasses } from './diplomacy';
import { registerBarbarianClasses } from './barbarians';
import BarbarianClient from '@civ-clone/simple-ai-client/BarbarianClient';
import isBarbarian from '@civ-clone/base-civilization-barbarian/isBarbarian';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';
import { DescribedClient, save } from '@civ-clone/core-save-game/save';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import requirementsData from './lib/requirements';
import civilopediaData from './lib/civilopedia';
import { instance as aiClientRegistryInstance } from '@civ-clone/core-ai-client/AIClientRegistry';
import {
  Seat,
  SeatChoice,
  TakenCivilizations,
  applySeatChoice,
  resolveSeatChoice,
  seatsFromOptions,
} from './lib/seats';
import hasMet from './lib/hasMet';
import { playerProgress, turnProgress } from './lib/progress';
import registries from './Client/registries';

export interface IGame {
  start(): void;
}

// A seat with its choices resolved and its AI client checked, ready to make a player and a client from.
type ResolvedSeat = {
  seat: Seat;
  choice: SeatChoice;
};

export class Game implements IGame {
  #automateLocalPlayer: boolean = false;
  #eventsBound: boolean = false;
  #observer: Observer | null = null;
  #localPlayerClient: DataTransferClient | null = null;
  // The seat each client was made from (#608), for a save to record: who played it, and a person's name. Weak, so
  //  that the clients of a game before this one in the same worker aren't kept for it.
  #seats: WeakMap<Client, Seat> = new WeakMap();
  #transport: Transport<TransportDataMap>;

  constructor(transport: Transport<TransportDataMap>) {
    this.#transport = transport;

    // A player brought into a running game (#168) is a computer player's: the engine asks for its client, as it never
    //  makes one itself. Bound here rather than in `bindEvents`, so a loaded game answers too.
    engine.on('player:spawned', (player: Player): void => {
      if (clientRegistryInstance.getBy('player', player).length > 0) {
        return;
      }

      // The host's default AI, whatever the seats chose (#604): a player brought in mid-game has no seat.
      clientRegistryInstance.register(
        this.#createClient(player, { kind: 'computer' })
      );
    });

    // A sign of life as each player's turn starts (#470), so that the page, waiting on a request while the AI players
    //  take their turns, doesn't take a long round for a game that has stopped. Bound here, so a loaded game sends it
    //  too.
    engine.on('player:turn-start', (): void =>
      this.#transport.send('alive', null)
    );

    // The turn and whose turn it is, for the line along the top of the page (#588). Bound here, with the sign of life,
    //  so a loaded game says so too, where `bindEvents` only runs for a new one.
    engine.on('turn:start', (turn: number): void =>
      this.#transport.send('notification', turnProgress(turn))
    );

    engine.on('player:turn-start', (player: Player | null): void => {
      if (!player) {
        console.warn('Empty player object returned.');

        return;
      }

      // Read as the local player, or as the observer's view, which may know everyone (#613).
      const notice = playerProgress(
        player,
        this.#localPlayerClient?.player() ?? this.#observer?.player() ?? null,
        (reader: Player, other: Player): boolean =>
          this.#observer?.view()?.hasMet(other) ??
          hasMet(reader, other, registries)
      );

      if (notice !== null) {
        this.#transport.send('notification', notice);
      }
    });

    transport.receive(
      'save',
      ({
        name,
        autosave,
      }: {
        name: string;
        autosave?: 'start' | 'autosave';
      }): void => {
        let data: string;

        try {
          data = JSON.stringify(
            save(defaultGame, {
              name,
              describeClient: (client: unknown): DescribedClient =>
                this.#describeClient(client as Client),
            })
          );
        } catch (error) {
          // Reported rather than thrown: the worker would otherwise die silently
          // mid-game, and a save that cannot be written is not a reason to lose
          // the game it was taken from. Said by the page as one it can't write
          // is, not as a passing notification that is easily missed (#581). An
          // autosave nobody asked for is only mentioned: the turn goes on (#653).
          if (autosave !== undefined) {
            this.#transport.send('notification', {
              key: 'SavedGame.autosave-failed',
              data: { error: describeError(error) },
            });

            return;
          }

          this.#transport.send('saveFailed', { message: describeError(error) });

          return;
        }

        if (autosave === undefined) {
          this.#transport.send('saveGame', { name, data });

          return;
        }

        // Compressed here rather than on the page (#653): late in a game the JSON is 15–30MB, and a Blob crosses to the
        //  page without a copy. Plain where the browser can't compress, as a download is. Read from `globalThis`: the
        //  TypeScript this builds with has no type for it yet.
        const Compression = (
          globalThis as {
            CompressionStream?: new (format: 'gzip') => TransformStream<
              Uint8Array,
              Uint8Array
            >;
          }
        ).CompressionStream;

        (Compression === undefined
          ? Promise.resolve(new Blob([data], { type: 'application/json' }))
          : new Response(
              new Blob([data]).stream().pipeThrough(new Compression('gzip'))
            ).blob()
        )
          .then((blob: Blob): void =>
            this.#transport.send('autosaveGame', {
              name,
              kind: autosave,
              data: blob,
            })
          )
          .catch((error: Error): void =>
            this.#transport.send('notification', {
              key: 'SavedGame.autosave-failed',
              data: { error: describeError(error) },
            })
          );
      }
    );

    transport.receive(
      'load',
      ({ data, seats }: { data: string; seats?: SeatChanges }): void => {
        this.#transport.send('notification', 'loading saved game...');

        let file: SaveGame;

        try {
          file = JSON.parse(data) as SaveGame;

          // The seats reassigned before loading (#608), by player id: a wrong shape is refused as a wrong file is.
          if (seats !== undefined && !isSeatChanges(seats)) {
            throw new TypeError(
              "The seats to load with must be { [playerId]: { kind: 'human' | 'computer', … } }."
            );
          }
        } catch (error) {
          // As any other failed load (#470).
          this.#transport.send('loadFailed', {
            message: describeError(error),
          });

          return;
        }

        this.load(file, seats ?? {});
      }
    );

    // The levels come from the rules rather than a list here, so a ruleset with other levels needs no change to the menu
    //  (#173). The plugins are imported for it, as a load does, before the game has started. A failure is answered as
    //  the request's (`answer`), so the menu hears of it rather than waiting for good (#470).
    answer(transport, 'difficulties', () =>
      import('../plugins').then(() =>
        defaultGame.availableDifficulties.sorted().map((Level) => ({
          name: typeNameOf(Level),
          level: Level.level(),
        }))
      )
    );

    // What the game setup (#604) offers: the civilizations and leaders still to be chosen, and the AI clients a computer
    //  seat can be given. Answered as `difficulties` is, with the plugins imported first.
    answer(transport, 'civilizations', () =>
      import('../plugins').then(() =>
        defaultGame.civilizations.entries().map((CivilizationType) => ({
          name: typeNameOf(CivilizationType),
          leaders: defaultGame.leaders
            .getByCivilization(CivilizationType)
            .map((LeaderType) => typeNameOf(LeaderType)),
        }))
      )
    );

    answer(transport, 'aiClients', () =>
      import('../plugins').then(() =>
        this.#availableAIClients().map((AIClientType) =>
          typeNameOf(AIClientType)
        )
      )
    );

    transport.receive('start', () => {
      // Once: a start refused for its seats (#604) can be tried again on the same game.
      if (!this.#eventsBound) {
        this.#eventsBound = true;
        this.bindEvents();
      }

      this.start();
    });

    transport.receive('setOption', ({ name, value }) => {
      if (name === 'automateLocalPlayer') {
        this.#automateLocalPlayer = !!value;
        this.#localPlayerClient?.setAutomationEnabled(
          this.#automateLocalPlayer
        );

        this.#transport.send(
          'notification',
          `local player automation ${
            this.#automateLocalPlayer ? 'enabled' : 'disabled'
          }`
        );

        return;
      }

      this.#transport.send('notification', `setting ${name} to ${value}`);
      engine.setOption(name, value);
    });

    // What the ruleset's things need, make obsolete and are replaced by, for the civilopedia (#37, #183).
    answer(transport, 'getRequirements', () => requirementsData());

    // Every entry the civilopedia shows, with the requirement entries about it and a unit's numbers (#183).
    answer(transport, 'getCivilopedia', () => civilopediaData());

    answer(transport, 'getOptions', (values: string[]) =>
      values.reduce((options, optionName) => {
        options[optionName] = engine.option(optionName);

        return options;
      }, {} as { [key: string]: any })
    );

    answer(transport, 'setOptions', (values: { [key: string]: any }) => {
      Object.entries(values).forEach(([option, value]) => {
        if (option === 'automateLocalPlayer') {
          this.#automateLocalPlayer = !!value;
          this.#localPlayerClient?.setAutomationEnabled(
            this.#automateLocalPlayer
          );

          return;
        }

        engine.setOption(option, value);
      });

      return null;
    });
  }

  // What a new game says as it starts up, which a loaded one, never `start`ed, has nothing of. The turn and whose turn
  //  it is are bound in the constructor, for both (#588).
  private bindEvents(): void {
    this.#transport.send('notification', `binding events`);

    engine.on('engine:initialise', (): void =>
      this.#transport.send('notification', `initialising...`)
    );

    engine.on('engine:plugins:load:success', (packageName: string): void =>
      this.#transport.send('notification', `loaded plugin: ${packageName}`)
    );

    engine.on('engine:plugins-loaded', (): void =>
      this.#transport.send('notification', `plugins loaded`)
    );

    engine.on('engine:start', (): void =>
      this.#transport.send('notification', `starting...`)
    );

    engine.on('world:generate-start-tiles', (): void =>
      this.#transport.send('notification', `generating start tiles...`)
    );

    engine.on('world:built', (): void =>
      this.#transport.send('notification', `world built`)
    );

    engine.on('game:start', (): void =>
      this.#transport.send('notification', `game start`)
    );
  }

  // The AI clients a computer seat can be given (#604): the host's own default first, then the rest registered with
  //  core-ai-client, leaving out the barbarians' and any base another one extends (core-strategy-ai-client registers
  //  `StrategyAIClient`). What the `aiClients` request lists, and all `#aiClientType` accepts.
  #availableAIClients(): (new (player: Player) => Client)[] {
    const registered = aiClientRegistryInstance.entries();

    return [
      SimpleAIClient,
      ...registered.filter(
        (AIClientType) =>
          AIClientType !== SimpleAIClient &&
          AIClientType !== BarbarianClient &&
          !registered.some(
            (Other) =>
              Other !== AIClientType && Other.prototype instanceof AIClientType
          )
      ),
    ] as unknown as (new (player: Player) => Client)[];
  }

  // A watched game stops at its ending, as a played one does, for the page to see it (#606): with every client a
  //  computer's the game would otherwise call its scoring complete and run on. A played game carries on as before.
  #stopAtEnding(observed: boolean): void {
    const rule = defaultGame.rules.getById(
      'civ1-game-end:game-over/carry-on-unattended'
    );

    if (observed) {
      rule?.disable();
    } else {
      rule?.enable();
    }
  }

  // The AI client a computer seat asked for, by class name; the host's own default when it asked for none.
  #aiClientType(name?: string): new (player: Player) => Client {
    if (name === undefined) {
      return SimpleAIClient;
    }

    const AIClientType = this.#availableAIClients().find(
      (Available) => typeNameOf(Available) === name
    );

    if (!AIClientType) {
      throw new TypeError(`There is no AI client called '${name}'.`);
    }

    return AIClientType;
  }

  // Every seat resolved before any player exists (#604): a seat that can't be filled stops the game before it starts,
  //  and says why, rather than leaving a partly set up game running (#470).
  #resolveSeats(): ResolvedSeat[] {
    const seats = seatsFromOptions(
        engine.option('seats'),
        engine.option('players')
      ),
      taken: TakenCivilizations = new Set();

    if (
      seats.filter((seat: Seat): boolean => seat.kind === 'human').length > 1
    ) {
      throw new TypeError(
        'Only one human seat can be played here for now (civ-clone/web-renderer#161).'
      );
    }

    return seats.map((seat: Seat): ResolvedSeat => {
      if (seat.kind === 'computer') {
        // Checked now, so that a wrong name is refused before anything starts; `#createClient` looks it up again.
        this.#aiClientType(seat.ai);
      }

      return { seat, choice: resolveSeatChoice(seat, defaultGame, taken) };
    });
  }

  // A watched game's computer players give the worker a moment before each turn they take (#607): an all-computer
  //  turn loop never otherwise leaves its promise chain, so a `pause` from the page would wait for good. The class
  //  keeps its name, which a save records.
  #paced(
    AIClientType: new (player: Player) => Client
  ): new (player: Player) => Client {
    const Paced = class extends (AIClientType as new (
      player: Player
    ) => Client) {
      async takeTurn(): Promise<any> {
        await new Promise((resolve) => setTimeout(resolve, 0));

        return super.takeTurn();
      }
    };

    Object.defineProperty(Paced, 'name', { value: AIClientType.name });

    return Paced;
  }

  // What a save records of a client (#608): a person's seat, with their name, or a program by class name, as the
  //  file always had it.
  #describeClient(client: Client): DescribedClient {
    const seat = this.#seats.get(client);

    return {
      kind: seat?.kind === 'human' ? 'human' : 'ai',
      // As `#aiClientType` names one, so that a load finds the same class.
      module: typeNameOf(client.constructor as { name: string }),
      ...(seat?.name === undefined ? {} : { name: seat.name }),
    };
  }

  // A seat from a save (#608) whose AI client this build doesn't have plays with the default instead, as every
  //  computer player in a loaded game did before the file said which.
  #seatAvailableHere(player: Player, seat: Seat): Seat {
    if (
      seat.kind !== 'computer' ||
      seat.ai === undefined ||
      isBarbarian(player)
    ) {
      return seat;
    }

    try {
      this.#aiClientType(seat.ai);

      return seat;
    } catch (error) {
      // Said on the page, not only the console: the player plays on, differently from how it was saved.
      this.#transport.send(
        'notification',
        `The AI client '${seat.ai}' that played a computer seat is not available here; the default plays it instead.`
      );

      return { ...seat, ai: undefined };
    }
  }

  #createClient(player: Player, seat: Seat, paced: boolean = false): Client {
    const client = this.#makeClient(player, seat, paced);

    this.#seats.set(client, seat);

    return client;
  }

  #makeClient(player: Player, seat: Seat, paced: boolean): Client {
    // The barbarians (#169) are never the human's: `civ1-barbarians` spawns their player, and it asks for a client
    //  with `player:spawned` like any player added mid-game.
    if (isBarbarian(player)) {
      return new BarbarianClient(player);
    }

    if (seat.kind !== 'human') {
      const AIClientType = this.#aiClientType(seat.ai);

      return new (paced ? this.#paced(AIClientType) : AIClientType)(player);
    }

    // One human player on this transport until each seat has its own (#161): a second one, in a seat list or a
    //  save, is refused rather than quietly taking the page over.
    if (this.#localPlayerClient !== null) {
      throw new TypeError(
        'Only one human player can be played here for now (civ-clone/web-renderer#161).'
      );
    }

    const client = new DataTransferClient(player, this.#transport, {
      automationEnabled: this.#automateLocalPlayer,
    });

    this.#localPlayerClient = client;

    return client;
  }

  /**
   * Put a saved game back, in place of generating a new one.
   *
   * The plugins are imported first and nothing else: no `engine.start()`, so
   * `engine:start` never fires and the rules that build a world and spawn
   * settlers never run. See `loadGame`.
   */
  load(file: SaveGame, changes: SeatChanges = {}): void {
    // A save with no human in it is watched, as a game set up without one is (#607): the observer sees it as its
    //  first civilization once it is back, since a loaded game doesn't start. A file with no clients at all is left
    //  to the load to refuse (#470).
    // Of the players the file has, as the page reassigned them (#608): a client listed for a player the game no
    //  longer has makes nobody human.
    // The changes as own entries only: a file names the ids, and `constructor` is one a plain object answers to.
    const changed = new Map<string, Seat>(Object.entries(changes)),
      players = new Set<string>(file.registries?.players ?? []),
      observed =
        Array.isArray(file.clients) &&
        !file.clients.some(
          (descriptor) =>
            (players.size === 0 || players.has(descriptor.playerId)) &&
            (changed.get(descriptor.playerId) ?? seatFromDescriptor(descriptor))
              .kind === 'human'
        );

    this.#observer?.dispose();
    this.#observer = observed ? new Observer(this.#transport) : null;

    import('../plugins')
      .then(() => {
        this.#stopAtEnding(observed);

        // Each client from the seat the save records, or the one the page reassigned it to (#608): a person's
        //  again, or the AI that served it.
        return loadGame(
          file,
          (player: Player, seat: Seat): Client =>
            this.#createClient(
              player,
              this.#seatAvailableHere(player, changed.get(player.id()) ?? seat),
              observed
            ),
          () => this.#observer?.observeFirst()
        );
      })
      .then((): void =>
        this.#transport.send('notification', `loaded '${file.meta.name}'`)
      )
      // Its own channel, as the page has already put its menu away: it says so and goes back to it (#470).
      .catch((error: unknown): void => {
        console.error(error);

        this.#transport.send('loadFailed', { message: describeError(error) });
      });
  }

  start(): void {
    let seats: ResolvedSeat[];

    try {
      seats = this.#resolveSeats();
    } catch (error: unknown) {
      console.error(error);

      this.#transport.send('workerError', { message: describeError(error) });

      return;
    }

    // A game nobody here plays is watched instead (#607): the page sees it as one of its players, and can hold the
    //  turns. Made before the engine starts, so it hears the game start.
    const observed = !seats.some(({ seat }) => seat.kind === 'human');

    // Whatever the game before this one had: a played game isn't watched.
    this.#observer?.dispose();
    this.#observer = observed ? new Observer(this.#transport) : null;

    engine.on('engine:start', (): void => {
      // The manifest is what `save` writes into the file and `hydrate` checks
      // it against, and the class registry is what turns a saved `type` back
      // into something to allocate. Registered before any player claims a
      // civilisation, because `civ1-player` unregisters one as it is claimed.
      engine.registerPlugins(plugins);
      registerClasses(defaultGame);
      registerDiplomacyClasses(defaultGame);
      registerBarbarianClasses(defaultGame);

      this.#stopAtEnding(observed);
    });

    engine.on('engine:start', (): void => {
      // Before any player is added: the rules that run as a player is added read it (Chieftain's starting gold).
      const name = engine.option('difficulty'),
        Level = defaultGame.availableDifficulties
          .sorted()
          .find((Available) => typeNameOf(Available) === name);

      if (Level) {
        defaultGame.difficulty.set(Level);
      }
    });

    engine.on('engine:start', (): void => {
      // The seats the game was set up with (#604), or the `players` count as one human and the rest computers.
      seats.forEach(({ seat, choice }: ResolvedSeat): void => {
        const player = new Player(),
          client = this.#createClient(player, seat, observed);

        applySeatChoice(player, choice, defaultGame);

        // The client first, so the rules that run as the player is added know whether a person plays it.
        clientRegistryInstance.register(client);
        playerRegistryInstance.register(player);
      });

      this.#transport.send('notification', `generating world...`);
    });

    // we don't want to try and use FS objects so replace this call with the direct events instead.
    engine.start();

    // A game that can't start would otherwise leave the page waiting with nothing to say why (#470).
    import('../plugins')
      .then(() => engine.emit('plugins:load:end'))
      .catch((error: unknown): void => {
        console.error(error);

        this.#transport.send('workerError', { message: describeError(error) });
      });
  }
}

export default Game;
