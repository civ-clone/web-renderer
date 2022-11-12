import DataTransferClient from '../../client/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import TransferObject from '../../client/TransferObject';
import Transport from '../../client/Transport';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';

export interface IGame {
  start(): void;
}

export class Game implements IGame {
  #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;

    transport.receive('start', () => {
      this.bindEvents();
      this.start();
    });

    transport.receive('setOption', ({ name, value }) => {
      this.#transport.send('notification', `setting ${name} to ${value}`);
      engine.setOption(name, value);
    });

    transport.receive('getOptions', (values: string[]) =>
      transport.send(
        'getOptions',
        values.reduce((options, optionName) => {
          options[optionName] = engine.option(optionName);

          return options;
        }, {} as { [key: string]: any })
      )
    );

    transport.receive('setOptions', (values: { [key: string]: any }) => {
      Object.entries(values).forEach(([option, value]) =>
        engine.setOption(option, value)
      );

      transport.send('setOptions');
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

    engine.on('player:turn-start', (player): void =>
      this.#transport.send(
        'notification',
        `player turn-start: ${player.civilization().constructor.name}`
      )
    );
  }

  start(): void {
    engine.on('engine:start', (): void => {
      new Array(parseInt(engine.option('players'), 10))
        .fill(0)
        .forEach((value: 0, i: number) => {
          const player = new Player(),
            // TODO: This is pretty basic.
            client =
              i === 0
                ? new DataTransferClient(
                    player,
                    (channel: string, payload: TransferObject) =>
                      this.#transport.send(channel, payload),
                    (
                      channel: string,
                      handler: (...args: any[]) => void
                    ): void => this.#transport.receive(channel, handler)
                  )
                : new SimpleAIClient(player);

          playerRegistryInstance.register(player);
          clientRegistryInstance.register(client);

          this.#transport.send('notification', `generating world...`);
        });
    });

    // we don't want to try and use FS objects so replace this call with the direct events instead.
    engine.start();

    import('./plugins').then(() => engine.emit('plugins:load:end'));
  }
}

export default Game;
