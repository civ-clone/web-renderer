// Which game a new game is (#668): civ.one's own, or Civ2's rules drawn with Civ2's art, which the player imports from
//  their own copy. Without that art New Game, Earth and the setup ask the worker nothing new and look exactly as they
//  did; with it, New Game asks which game first, and Civ2's is played on the isometric grid, with no grid question and
//  no Earth. A worker plays one set of plugins, so a game other than the one it has loaded gets a new worker
//  (`ReplaceableTransport`), which everything listening goes on hearing from.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/grids';
import './lib/interfaces';
import './lib/classicInterface';
import './lib/artPacks';

import {
  TransportDataMap,
  TransportReceiveHandler,
} from '@civ-clone/core-data-client/Transport';
import { askEarth, askNewGame } from '@civ-clone/ui-menus/components/newGame';
import GameSetupForm from '@civ-clone/ui-interface-modern/components/GameSetupForm';
import GameSetupWindow from '@civ-clone/ui-interface-classic/components/GameSetupWindow';
import { PackMetadata } from '@civ-clone/ui-assets/lib/packs';
import ReplaceableTransport from '@civ-clone/ui-client/ReplaceableTransport';
import Request from '@civ-clone/core-data-client/Request';
import Transport from '@civ-clone/ui-client/Transport';
import i18next from 'i18next';
import { installTilesets } from '@civ-clone/ui-assets/lib/tilesets';
import { mayOfferOtherGames } from '@civ-clone/ui-menus/lib/pluginSets';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL pluginSetChoice: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

// linkedom's `<select>` `value` is read-only, where a browser's selects the option.
const selectPrototype = (globalThis as any).HTMLSelectElement.prototype,
  selectValue = Object.getOwnPropertyDescriptor(selectPrototype, 'value')!;

Object.defineProperty(selectPrototype, 'value', {
  configurable: true,
  get(this: HTMLSelectElement) {
    return selectValue.get!.call(this);
  },
  set(this: HTMLSelectElement, value: string) {
    Array.from(this.querySelectorAll('option')).forEach((option) =>
      option.toggleAttribute('selected', option.getAttribute('value') === value)
    );
  },
});

const settle = async (): Promise<void> => {
  for (let index = 0; index < 20; index++) {
    await Promise.resolve();
  }
};

const text = (element: Element | null): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  openDialogs = () => Array.from(document.querySelectorAll('dialog[open]')),
  latest = () => {
    const dialogs = openDialogs();

    return dialogs[dialogs.length - 1] as HTMLElement;
  },
  shown = () => ({
    title: text(latest()?.querySelector('header') ?? null).replace(
      /Close$/,
      ''
    ),
    options: Array.from(latest()?.querySelectorAll('option') ?? []).map(text),
  }),
  choose = (value: string) => {
    const select = latest().querySelector('select') as HTMLSelectElement;

    Array.from(select.querySelectorAll('option')).forEach((option) =>
      option.toggleAttribute('selected', option.getAttribute('value') === value)
    );
    select.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
    );
  },
  closeAll = () => openDialogs().forEach((dialog) => dialog.remove());

/**
 * A page's transport to a worker civ.one's way: which sets there are for the art named, the one loaded, and a new
 *  worker on `replace`, which has loaded none. Everything asked, sent and replaced is in `log`.
 */
const fakeWorkers = () => {
  const log: [string, unknown][] = [],
    worker = { chosen: null as string | null },
    sets = [
      { id: 'civ1', tileset: null },
      { id: 'civ1-enhanced', tileset: null },
      { id: 'civ2', tileset: 'civ2' },
    ],
    levels = {
      'civ1-enhanced': ['Chieftain', 'Warlord', 'Prince', 'King', 'Emperor'],
      civ2: ['Chieftain', 'Warlord', 'Prince', 'King', 'Emperor', 'Deity'],
    } as { [id: string]: string[] },
    // What a setup request loads: the set chosen, or the default.
    load = (): string => (worker.chosen ??= 'civ1-enhanced'),
    transport = {
      replace: (): void => {
        log.push(['replace', worker.chosen]);
        worker.chosen = null;
      },
      request: (request: Request): Promise<unknown> => {
        const [args] = request.args();

        log.push([request.channel(), args]);

        switch (request.channel()) {
          case 'pluginSets':
            return Promise.resolve({
              sets: sets.filter(
                ({ id, tileset }) =>
                  (tileset === null && id !== 'civ2') ||
                  (args as string[]).includes(tileset!)
              ),
              default: 'civ1-enhanced',
              chosen: worker.chosen,
            });
          case 'choosePluginSet':
            if (worker.chosen !== null && worker.chosen !== args) {
              return Promise.reject(new Error('loaded already'));
            }

            worker.chosen = args as string;

            return Promise.resolve(args);
          case 'difficulties':
            return Promise.resolve(
              levels[load()]!.map((name, level) => ({ name, level }))
            );
          case 'civilizations':
            load();

            return Promise.resolve([
              { name: 'Babylonian', leaders: ['Hammurabi'] },
              { name: 'Roman', leaders: ['JuliusCaesar'] },
              { name: 'Zulu', leaders: ['Shaka'] },
            ]);
          case 'aiClients':
            load();

            return Promise.resolve(['SimpleAIClient']);
          case 'ruleSets':
            load();

            return Promise.resolve({ sets: [], choices: [], problems: [] });
          default:
            return Promise.resolve({});
        }
      },
      send: (channel: string, data: unknown): void => {
        log.push([channel, data]);
      },
    } as unknown as Transport;

  return { log, transport, worker };
};

const channels = (log: [string, unknown][]): string[] =>
  log.map(([channel]) => channel);

// Civ2's art, as an import leaves it (#97): its flags' colours are what its cities are drawn with.
const civ2Metadata: PackMetadata = {
  anchors: {},
  colours: {
    flag: [
      { primary: [250, 1, 2], secondary: [160, 3, 4] },
      { primary: [0, 0, 250], secondary: [0, 0, 160] },
    ],
  } as PackMetadata['colours'],
};

(async () => {
  await i18next.init({ lng: 'en', defaultNS: 'default', ns: ['default'] });
  await import('./lib/strings');

  // ReplaceableTransport: a new worker in the old one's place, heard from as the old one was.
  {
    type Message = { channel: string; data: unknown };

    const workers: {
        sent: Message[];
        listeners: Map<string, TransportReceiveHandler<any>[]>;
        ended: boolean;
        disposed: boolean;
      }[] = [],
      connect = () => {
        const worker = {
          sent: [] as Message[],
          listeners: new Map<string, TransportReceiveHandler<any>[]>(),
          ended: false,
          disposed: false,
        };

        workers.push(worker);

        const listen = (channel: string, handler: any) => {
          worker.listeners.set(channel, [
            ...(worker.listeners.get(channel) ?? []),
            handler,
          ]);

          return () =>
            worker.listeners.set(
              channel,
              (worker.listeners.get(channel) ?? []).filter(
                (other) => other !== handler
              )
            );
        };

        return {
          transport: {
            receive: listen,
            receiveOnce: (channel: string, handler: any) => {
              const stop = listen(channel, (data: unknown) => {
                stop();
                handler(data);
              });

              return stop;
            },
            request: () => Promise.resolve(workers.indexOf(worker)),
            reply: () => {},
            send: (channel: string, data: unknown) =>
              worker.sent.push({ channel, data }),
            dispose: () => {
              worker.disposed = true;
            },
          } as any,
          end: () => {
            worker.ended = true;
          },
        };
      },
      say = (index: number, channel: string, data: unknown) =>
        (workers[index]!.listeners.get(channel) ?? []).forEach((handler) =>
          handler(data)
        ),
      replaceable = new ReplaceableTransport<TransportDataMap>(connect, {
        replay: ['setOption'],
      }),
      heard: string[] = [];

    replaceable.receive('notification', (data) => heard.push(`n:${data}`));

    const stop = replaceable.receive('gameData', (data) =>
      heard.push(`g:${data}`)
    );

    replaceable.receiveOnce('workerError', (data) => heard.push(`e:${data}`));
    replaceable.send('setOption', { name: 'automateLocalPlayer', value: true });
    replaceable.send('action', 'not replayed');

    say(0, 'notification', 'one');
    stop();
    say(0, 'gameData', 'stopped');

    replaceable.replace();

    say(0, 'notification', 'from the old worker');
    say(1, 'notification', 'two');
    say(1, 'gameData', 'still stopped');
    say(1, 'workerError', 'once');
    say(1, 'workerError', 'twice');

    expect(
      'replaced, the old worker is disposed of and ended, and everything still listening hears the new one, a once only once',
      [
        workers.map(({ ended, disposed }) => [ended, disposed]),
        heard,
        await replaceable.request(new Request('anything', null)),
      ],
      [
        [
          [true, true],
          [false, false],
        ],
        ['n:one', 'n:two', 'e:once'],
        1,
      ]
    );
    expect(
      'and the new worker is told again what the page told the old one on the replayed channels, and nothing else',
      workers[1]!.sent,
      [
        {
          channel: 'setOption',
          data: { name: 'automateLocalPlayer', value: true },
        },
      ]
    );
  }

  // Without Civ2's art: nothing new is asked, and New Game opens on the world sizes as it always has.
  {
    const { log, transport } = fakeWorkers();

    expect(
      "without art beyond Civ1's there's no other game to offer",
      mayOfferOtherGames(),
      false
    );

    askNewGame(transport);
    await settle();

    expect(
      'New Game asks nothing first, and opens on the sizes',
      [channels(log), shown().title],
      [[], 'How big a world?']
    );

    closeAll();

    const setup = await GameSetupWindow.ask(transport);

    expect(
      'and the setup asks only what it always has, with no game to choose',
      [
        channels(log),
        setup.element().querySelector('select[name=pluginSet]') === null,
      ],
      [
        [
          'civilizations',
          'aiClients',
          'difficulties',
          'ruleSets',
          'getOptions',
        ],
        true,
      ]
    );

    setup.close();
    closeAll();
  }

  installTilesets({ civ2: { complete: true, metadata: civ2Metadata } });

  // With it: which game first.
  {
    const { log, transport, worker } = fakeWorkers();

    expect("with Civ2's art imported there may be", mayOfferOtherGames(), true);

    askNewGame(transport);
    await settle();

    expect(
      'New Game asks which game first, Civilization or Civilization II, a preview, after asking with the art imported',
      [log, shown()],
      [
        [['pluginSets', ['civ1', 'civ2']]],
        {
          title: 'Which game?',
          options: ['Civilization', 'Civilization II (preview)'],
        },
      ]
    );

    choose('civ2');
    await settle();

    expect(
      'Civ2 is loaded in the worker, and played on the isometric grid: no grid question, its sizes',
      [log.slice(1), worker.chosen, shown().title, shown().options[0]],
      [
        [['choosePluginSet', 'civ2']],
        'civ2',
        'How big a world?',
        'Tiny (20 × 50)',
      ]
    );

    choose('normal');
    await settle();

    expect('and the levels it offers are its six', shown().options.length, 6);

    choose('Prince');
    await settle();
    choose('3');
    await settle();

    expect(
      'and the world goes to the engine on the isometric grid',
      (
        log.find(([channel]) => channel === 'setOptions')?.[1] as {
          topologyId: string;
        }
      ).topologyId,
      'staggered-iso'
    );

    closeAll();
    log.length = 0;

    // Civilization now: the worker has Civ2's plugins, so it is replaced, and the new one loads the default as always.
    askNewGame(transport);
    await settle();

    expect(
      'asked again, New Game starts on the game chosen last',
      latest().querySelector('option[selected]')?.getAttribute('value'),
      'civ2'
    );

    choose('civ1-enhanced');
    await settle();

    expect(
      'choosing Civilization after Civ2 replaces the worker, asks the new one nothing yet, and asks for the grid as before',
      [log.slice(1), worker.chosen, shown().title],
      [[['replace', 'civ2']], null, 'Which map grid?']
    );

    closeAll();

    // Earth after Civ2: Civ1's own game, on a new worker.
    worker.chosen = 'civ2';
    log.length = 0;

    askEarth(transport);
    await settle();

    expect(
      'Earth after Civ2 puts Civ1’s game back first, and never asks which game',
      [channels(log), shown().title],
      [['pluginSets', 'replace'], 'How big a world?']
    );

    closeAll();
  }

  // The setup, both interfaces': the game to choose, and Civ2's on its own grid.
  for (const [name, Setup] of [
    ['classic', GameSetupWindow],
    ['modern', GameSetupForm],
  ] as const) {
    const { log, transport, worker } = fakeWorkers(),
      setup = await Setup.ask(transport, () => {}, { pluginSet: 'civ2' }),
      element = setup.element(),
      games = element.querySelector(
        'select[name=pluginSet]'
      ) as HTMLSelectElement | null;

    expect(
      `${name}: the setup for Civ2 has the game to choose, Civ2 chosen, and loads it before asking the rest`,
      [
        games === null
          ? null
          : Array.from(games.querySelectorAll('option'), (option) => [
              option.getAttribute('value'),
              text(option),
              option.hasAttribute('selected') || option.selected,
            ]),
        channels(log).slice(0, 3),
        worker.chosen,
      ],
      [
        [
          ['civ1-enhanced', 'Civilization', false],
          ['civ2', 'Civilization II (preview)', true],
        ],
        ['pluginSets', 'choosePluginSet', 'civilizations'],
        'civ2',
      ]
    );
    expect(
      `${name}: on the isometric grid only, with no grid to choose and no Earth`,
      [
        element.querySelector('select[name=topologyId]') === null,
        Array.from(
          element.querySelectorAll('select[name=map] option'),
          (option) => option.getAttribute('value')
        ).some((value) => (value ?? '').startsWith('earth:')),
        element.querySelectorAll('select[name=difficulty] option').length,
      ],
      [true, false, 6]
    );

    log.length = 0;

    games!.value = 'civ1-enhanced';
    games!.dispatchEvent(new Event('change'));
    await settle();

    const reopened = openDialogs().filter((dialog) =>
      dialog.classList.contains('game-setup-window')
    );

    expect(
      `${name}: choosing Civilization replaces the worker and opens the setup again for it, with Earth and its five levels`,
      [
        channels(log).slice(0, 2),
        reopened.length,
        reopened[0]
          ?.querySelector('select[name=pluginSet] option[selected]')
          ?.getAttribute('value'),
        Array.from(
          reopened[0]?.querySelectorAll('select[name=map] option') ?? [],
          (option) => option.getAttribute('value')
        ).some((value) => (value ?? '').startsWith('earth:')),
        reopened[0]?.querySelectorAll('select[name=difficulty] option').length,
      ],
      [['pluginSets', 'replace'], 1, 'civ1-enhanced', true, 5]
    );

    closeAll();
  }

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL pluginSetChoice (${failures.length} of ${checks})\n${failures.join(
        '\n'
      )}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS pluginSetChoice (${checks} checks)\n`);
})().catch((error) => {
  process.stderr.write(`FAIL pluginSetChoice: ${error?.stack ?? error}\n`);
  process.exit(1);
});
