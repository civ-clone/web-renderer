import Client from '@civ-clone/core-client/Client';
import DataTransferClient from './DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import { SaveGame } from '@civ-clone/core-save-game/SaveGame';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import TransferObject from './TransferObject';
import Transport from './Transport';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import loadGame from './loadGame';
import { plugins } from '../plugins';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';
import { save } from '@civ-clone/core-save-game/save';

export interface IGame {
  start(): void;
}

export class Game implements IGame {
  #automateLocalPlayer: boolean = false;
  #localPlayerClient: DataTransferClient | null = null;
  #transport: Transport<TransportDataMap>;

  constructor(transport: Transport<TransportDataMap>) {
    this.#transport = transport;

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

      this.load(JSON.parse(data) as SaveGame);
    });

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

    transport.receive('getOptions', (values) =>
      transport.send(
        'getOptions',
        values.reduce((options, optionName) => {
          options[optionName] = engine.option(optionName);

          return options;
        }, {} as { [key: string]: any })
      )
    );

    transport.receive('setOptions', (values) => {
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

      transport.send('setOptions', null);
    });
  }

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

    engine.on('turn:start', (turn): void =>
      this.#transport.send('notification', `turn start ${turn}`)
    );

    engine.on('player:turn-start', (player): void => {
      if (!player) {
        console.warn('Empty player object returned.');

        return;
      }

      this.#transport.send(
        'notification',
        `player turn-start: ${player.civilization().constructor.name}`
      );
    });
  }

  #createClient(player: Player, human: boolean): Client {
    if (!human) {
      return new SimpleAIClient(player);
    }

    const client = new DataTransferClient(
      player,
      this.#transport,
      (channel: string, payload: TransferObject) =>
        this.#transport.send(channel, payload),
      (channel: string, handler: (...args: any[]) => void): void => {
        this.#transport.receive(channel, handler);
      },
      {
        automationEnabled: this.#automateLocalPlayer,
      }
    );

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
      .then((): void => {
        loadGame(
          file,
          (player: Player, human: boolean): Client =>
            this.#createClient(player, human)
        );

        this.#transport.send('notification', `loaded '${file.meta.name}'`);
      })
      .catch((error: Error): void =>
        this.#transport.send('notification', `could not load: ${error.message}`)
      );
  }

  start(): void {
    engine.on('engine:start', (): void => {
      // The manifest is what `save` writes into the file and `hydrate` checks
      // it against, and the class registry is what turns a saved `type` back
      // into something to allocate. Registered before any player claims a
      // civilisation, because `civ1-player` unregisters one as it is claimed.
      engine.registerPlugins(plugins);
      registerClasses(defaultGame);
    });

    engine.on('engine:start', (): void => {
      new Array(parseInt(engine.option('players'), 10))
        .fill(0)
        .forEach((value: 0, i: number) => {
          // TODO: This is pretty basic.
          const player = new Player(),
            client = this.#createClient(player, i === 0);

          playerRegistryInstance.register(player);
          clientRegistryInstance.register(client);

          this.#transport.send('notification', `generating world...`);
        });
    });

    // we don't want to try and use FS objects so replace this call with the direct events instead.
    engine.start();

    import('../plugins').then(() => engine.emit('plugins:load:end'));
  }
}

export default Game;
