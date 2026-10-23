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
import { plugins } from '../plugins';
import { registerDiplomacyClasses } from './diplomacy';
import { registerBarbarianClasses } from './barbarians';
import BarbarianClient from '@civ-clone/simple-ai-client/BarbarianClient';
import isBarbarian from '@civ-clone/base-civilization-barbarian/isBarbarian';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';
import { save } from '@civ-clone/core-save-game/save';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import hasMet from './lib/hasMet';
import { playerProgress, turnProgress } from './lib/progress';
import registries from './Client/registries';

export interface IGame {
  start(): void;
}

export class Game implements IGame {
  #automateLocalPlayer: boolean = false;
  #localPlayerClient: DataTransferClient | null = null;
  #transport: Transport<TransportDataMap>;

  constructor(transport: Transport<TransportDataMap>) {
    this.#transport = transport;

    // A player brought into a running game (#168) is a computer player's: the engine asks for its client, as it never
    //  makes one itself. Bound here rather than in `bindEvents`, so a loaded game answers too.
    engine.on('player:spawned', (player: Player): void => {
      if (clientRegistryInstance.getBy('player', player).length > 0) {
        return;
      }

      clientRegistryInstance.register(this.#createClient(player, false));
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

      const notice = playerProgress(
        player,
        this.#localPlayerClient?.player() ?? null,
        (reader: Player, other: Player): boolean =>
          hasMet(reader, other, registries)
      );

      if (notice !== null) {
        this.#transport.send('notification', notice);
      }
    });

    transport.receive('save', ({ name }: { name: string }): void => {
      try {
        this.#transport.send('saveGame', {
          name,
          data: JSON.stringify(save(defaultGame, { name })),
        });
      } catch (error) {
        // Reported rather than thrown: the worker would otherwise die silently
        // mid-game, and a save that cannot be written is not a reason to lose
        // the game it was taken from.
        this.#transport.send(
          'notification',
          `could not save: ${(error as Error).message}`
        );
      }
    });

    transport.receive('load', ({ data }: { data: string }): void => {
      this.#transport.send('notification', 'loading saved game...');

      let file: SaveGame;

      try {
        file = JSON.parse(data) as SaveGame;
      } catch (error) {
        // As any other failed load (#470).
        this.#transport.send('loadFailed', { message: describeError(error) });

        return;
      }

      this.load(file);
    });

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

    transport.receive('start', () => {
      this.bindEvents();
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

  #createClient(player: Player, human: boolean): Client {
    // The barbarians (#169) are never the human's: `civ1-barbarians` spawns their player, and it asks for a client
    //  with `player:spawned` like any player added mid-game.
    if (isBarbarian(player)) {
      return new BarbarianClient(player);
    }

    if (!human) {
      return new SimpleAIClient(player);
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
  load(file: SaveGame): void {
    import('../plugins')
      .then(() =>
        loadGame(
          file,
          (player: Player, human: boolean): Client =>
            this.#createClient(player, human)
        )
      )
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
    engine.on('engine:start', (): void => {
      // The manifest is what `save` writes into the file and `hydrate` checks
      // it against, and the class registry is what turns a saved `type` back
      // into something to allocate. Registered before any player claims a
      // civilisation, because `civ1-player` unregisters one as it is claimed.
      engine.registerPlugins(plugins);
      registerClasses(defaultGame);
      registerDiplomacyClasses(defaultGame);
      registerBarbarianClasses(defaultGame);
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
      new Array(parseInt(engine.option('players'), 10))
        .fill(0)
        .forEach((value: 0, i: number) => {
          // TODO: This is pretty basic.
          const player = new Player(),
            client = this.#createClient(player, i === 0);

          // The client first, so the rules that run as the player is added know whether a person plays it.
          clientRegistryInstance.register(client);
          playerRegistryInstance.register(player);

          this.#transport.send('notification', `generating world...`);
        });
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
