// Which game a new game is (#668): civ.one's own, or Civ2's rules, drawn with Civ2's art where the player has imported
//  it from their own copy, and otherwise with civ.one's isometric pixel art. With no art installed beyond the
//  interface's New Game, Earth and the setup ask the worker nothing new and look exactly as they did; with the pixel art
//  or Civ2's, New Game asks which game first, and Civ2's is played on the isometric grid, with no grid question and no
//  Earth. A worker plays one set of plugins, so a game other than the one it has loaded gets a new worker
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
import GameSetup from '@civ-clone/ui-client/lib/gameSetup';
import GameSetupForm from '@civ-clone/ui-interface-modern/components/GameSetupForm';
import GameSetupWindow from '@civ-clone/ui-interface-classic/components/GameSetupWindow';
import { PackMetadata } from '@civ-clone/ui-assets/lib/packs';
import {
  RequestFailed,
  disposedMessage,
} from '@civ-clone/core-data-client/AbstractTransport';
import ReplaceableTransport from '@civ-clone/ui-client/ReplaceableTransport';
import Request from '@civ-clone/core-data-client/Request';
import Transport from '@civ-clone/ui-client/Transport';
import i18next from 'i18next';
import { installTilesets, mapTileset } from '@civ-clone/ui-assets/lib/tilesets';
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
    // `refuse` names a set `choosePluginSet` fails for, as a worker that can't load it answers; `broken` makes every
    //  request throw, as a page that can't reach its worker would.
    worker = {
      chosen: null as string | null,
      refuse: null as string | null,
      broken: false,
      // `choosePluginSet` waits on it, when given.
      hold: null as Promise<void> | null,
    },
    // Each with its art in the order it prefers it, as civ.one's are: Civ2's own, then the isometric pixel art.
    sets = [
      { id: 'civ1', tilesets: [] as string[] },
      { id: 'civ1-enhanced', tilesets: [] as string[] },
      { id: 'civ2', tilesets: ['civ2', 'iso-pixelart'] },
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

        if (worker.broken) {
          throw new Error('no worker');
        }

        switch (request.channel()) {
          case 'pluginSets':
            return Promise.resolve({
              sets: sets
                .map(({ id, tilesets }) => ({
                  id,
                  tilesets,
                  tileset:
                    tilesets.find((tileset) =>
                      (args as string[]).includes(tileset)
                    ) ?? null,
                }))
                .filter(
                  ({ tilesets, tileset }) =>
                    tilesets.length === 0 || tileset !== null
                )
                .map(({ id, tileset }) => ({ id, tileset })),
              default: 'civ1-enhanced',
              chosen: worker.chosen,
            });
          case 'choosePluginSet':
            if (worker.refuse === args) {
              return Promise.reject(
                new RequestFailed('choosePluginSet', 'could not load')
              );
            }

            if (worker.chosen !== null && worker.chosen !== args) {
              return Promise.reject(new Error('loaded already'));
            }

            worker.chosen = args as string;

            return (worker.hold ?? Promise.resolve()).then(() => args);
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
          // Civ2's rules offer their own sizes, as civ2-world registers them (#1175); Civ1's offer none.
          case 'worldSizes':
            return Promise.resolve(
              load() === 'civ2' ? civ2WorldSizes : { sizes: [], custom: null }
            );
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

// The world sizes Civ2's rules offer (#1175): Small, Normal and Large, with 3 to 7 civilizations.
const civ2Players = { minPlayers: 3, maxPlayers: 7, players: 7 },
  civ2WorldSizes = {
    sizes: (
      [
        ['small', 40, 50],
        ['normal', 50, 80],
        ['large', 75, 120],
      ] as const
    ).map(([key, width, height]) => ({
      key,
      topologyId: 'staggered-iso',
      width,
      height,
      ...civ2Players,
      // Civ2's own Earth comes in each size (#1176).
      earth: true,
    })),
    custom: {
      topologyId: 'staggered-iso',
      minWidth: 20,
      maxWidth: 250,
      minHeight: 20,
      maxHeight: 250,
      minArea: 1000,
      maxArea: 10000,
      ...civ2Players,
    },
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

  // ReplaceableTransport: a new worker in the old one's place, heard from as the old one was. The workers' transports
  //  here have no `dispose`, so what is rejected on `replace` is rejected by the replaceable transport itself.
  {
    type Message = { channel: string; data: unknown };

    const workers: {
        sent: Message[];
        listeners: Map<string, TransportReceiveHandler<any>[]>;
        ended: boolean;
      }[] = [],
      connect = () => {
        const worker = {
          sent: [] as Message[],
          listeners: new Map<string, TransportReceiveHandler<any>[]>(),
          ended: false,
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
            // A request on `hang` is never answered: the worker has gone quiet.
            // `throw` throws as it is asked.
            request: (request: Request) => {
              if (request.channel() === 'throw') {
                throw new Error('thrown at once');
              }

              return request.channel() === 'hang'
                ? new Promise(() => {})
                : Promise.resolve(workers.indexOf(worker));
            },
            reply: () => {},
            send: (channel: string, data: unknown) =>
              worker.sent.push({ channel, data }),
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
    replaceable.receiveOnce('alive', (data) => heard.push(`a:${data}`));
    replaceable.send('setOption', { name: 'automateLocalPlayer', value: true });
    replaceable.send('setOption', { name: 'other', value: 1 });
    replaceable.send('setOption', {
      name: 'automateLocalPlayer',
      value: false,
    });
    replaceable.send('action', 'not replayed');

    // A request whose transport throws as it's asked rejects with that, and isn't left waiting for `replace`.
    const thrown = await replaceable.request(new Request('throw', null)).then(
      () => 'answered',
      (error: Error) =>
        `${error instanceof RequestFailed ? 'RequestFailed' : 'Error'}: ${
          error.message
        }`
    );

    // Waiting on the old worker as it is replaced.
    const hanging = replaceable.request(new Request('hang', null)).then(
      () => 'answered',
      (error: Error) =>
        `${error instanceof RequestFailed ? 'RequestFailed' : 'Error'}: ${
          error.message
        }`
    );

    say(0, 'notification', 'one');
    // A once that has fired before the replacement isn't listened to again.
    say(0, 'alive', 'before');
    stop();
    say(0, 'gameData', 'stopped');

    replaceable.replace();

    say(0, 'notification', 'from the old worker');
    say(1, 'notification', 'two');
    say(1, 'gameData', 'still stopped');
    say(1, 'alive', 'after');
    say(1, 'workerError', 'once');
    say(1, 'workerError', 'twice');

    expect(
      'replaced, the old worker is ended, and everything still listening hears the new one, a once only once, and one that had fired not again',
      [
        workers.map(({ ended }) => ended),
        heard,
        await replaceable.request(new Request('anything', null)),
      ],
      [[true, false], ['n:one', 'a:before', 'n:two', 'e:once'], 1]
    );
    expect(
      'a request still waiting on the old worker is rejected, as a request the page has been told of, though its transport has no dispose; one that threw at once rejected with its own error',
      [await hanging, thrown],
      [`RequestFailed: ${disposedMessage}`, 'Error: thrown at once']
    );
    expect(
      'and the new worker is told again the last value of each option the page sent the old one, and nothing else',
      workers[1]!.sent,
      [
        { channel: 'setOption', data: { name: 'other', value: 1 } },
        {
          channel: 'setOption',
          data: { name: 'automateLocalPlayer', value: false },
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
    log.length = 0;

    askEarth(transport);
    await settle();

    expect(
      "and Play Earth asks nothing either, and offers Civ1's square Earth",
      [channels(log), shown()],
      [
        [],
        {
          title: 'How big a world?',
          options: ['Normal (80 × 50)', 'Large (104 × 65)', 'Huge (128 × 80)'],
        },
      ]
    );

    closeAll();
  }

  // With only civ.one's own art, the pixel art that ships with it: which game first, and Civ2's drawn with the
  //  isometric pixel art.
  installTilesets({});

  {
    const { log, transport, worker } = fakeWorkers();

    expect(
      'with the pixel art there may be another game',
      mayOfferOtherGames(),
      true
    );

    askNewGame(transport);
    await settle();

    expect(
      'New Game asks which game first, asking with the pixel art there, and offers Civ2',
      [log, shown()],
      [
        [
          [
            'pluginSets',
            ['civ1', 'civ1-pixelart', 'hex-pixelart', 'iso-pixelart'],
          ],
        ],
        {
          title: 'Which game?',
          options: ['Civilization', 'Civilization II (preview)'],
        },
      ]
    );

    choose('civ2');
    await settle();

    expect(
      "Civ2 is loaded and played on the isometric grid, drawn with the isometric pixel art: no grid question, Civ2's own sizes",
      [
        log.slice(1),
        worker.chosen,
        mapTileset('staggered-iso').id,
        shown().title,
      ],
      [
        [
          ['choosePluginSet', 'civ2'],
          ['worldSizes', null],
        ],
        'civ2',
        'iso-pixelart',
        'How big a world?',
      ]
    );

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
        [
          [
            'pluginSets',
            ['civ1', 'civ2', 'civ1-pixelart', 'hex-pixelart', 'iso-pixelart'],
          ],
        ],
        {
          title: 'Which game?',
          options: ['Civilization', 'Civilization II (preview)'],
        },
      ]
    );

    choose('civ2');
    await settle();

    expect(
      "Civ2 is loaded in the worker, and played on the isometric grid: no grid question, and Civ2's own sizes, from its rules, with Normal selected",
      [
        log.slice(1),
        worker.chosen,
        shown().title,
        shown().options,
        latest().querySelector('option[selected]')?.getAttribute('value'),
      ],
      [
        [
          ['choosePluginSet', 'civ2'],
          ['worldSizes', null],
        ],
        'civ2',
        'How big a world?',
        ['Small (40 × 50)', 'Normal (50 × 80)', 'Large (75 × 120)'],
        'normal',
      ]
    );

    choose('large');
    await settle();

    expect('and the levels it offers are its six', shown().options.length, 6);

    choose('Prince');
    await settle();

    expect(
      'and from 3 to 7 civilizations, 7 selected',
      [
        shown().options,
        latest().querySelector('option[selected]')?.getAttribute('value'),
      ],
      [
        [
          '7 civilizations',
          '6 civilizations',
          '5 civilizations',
          '4 civilizations',
          '3 civilizations',
        ],
        '7',
      ]
    );

    choose('3');
    await settle();

    expect(
      'and the world goes to the engine on the isometric grid, at the size chosen',
      (({ topologyId, width, height, players }) => [
        topologyId,
        width,
        height,
        players,
      ])(
        log.find(([channel]) => channel === 'setOptions')?.[1] as {
          topologyId: string;
          width: number;
          height: number;
          players: number;
        }
      ),
      ['staggered-iso', 75, 120, 3]
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
      "choosing Civilization after Civ2 replaces the worker, asks the new one for its sizes, of which Civ1's rules have none, and asks for the grid as before",
      [log.slice(1), worker.chosen, shown().title],
      [
        [
          ['replace', 'civ2'],
          ['worldSizes', null],
        ],
        'civ1-enhanced',
        'Which map grid?',
      ]
    );

    choose('square');
    await settle();

    expect("and the sizes are Civ1's own, as always", shown().options, [
      'Tiny (40 × 25)',
      'Small (64 × 40)',
      'Normal (80 × 50)',
      'Large (104 × 65)',
      'Huge (128 × 80)',
    ]);

    closeAll();

    // Earth with Civ2 to play (#1176): which game first, then that game's Earth.
    worker.chosen = 'civ2';
    log.length = 0;

    askEarth(transport);
    await settle();

    expect(
      'Earth with Civ2 to play asks which game, starting on the one chosen last',
      [
        channels(log),
        shown(),
        latest().querySelector('option[selected]')?.getAttribute('value'),
      ],
      [
        ['pluginSets'],
        {
          title: 'Which game?',
          options: ['Civilization', 'Civilization II (preview)'],
        },
        'civ2',
      ]
    );

    const playEarth = async (game: string): Promise<{ [key: string]: any }> => {
      log.length = 0;
      choose(game);
      await settle();

      const sizes = shown();

      choose('normal');
      await settle();
      choose(latest().querySelector('option')!.getAttribute('value')!);
      await settle();
      choose(
        latest().querySelector('option[selected]')!.getAttribute('value')!
      );
      await settle();

      return {
        asked: channels(log).filter((channel) =>
          ['replace', 'choosePluginSet', 'worldSizes'].includes(channel)
        ),
        sizes,
        options: log.find(([channel]) => channel === 'setOptions')?.[1],
      };
    };

    const civ1 = await playEarth('civ1-enhanced');

    expect(
      "Civilization's Earth is Civ1's, on the square grid, from a new worker, as it always was",
      [
        civ1.asked,
        civ1.sizes,
        (({ earth, topologyId, width, height }) => [
          earth,
          topologyId,
          width,
          height,
        ])(civ1.options),
      ],
      [
        ['replace', 'worldSizes'],
        {
          title: 'How big a world?',
          options: ['Normal (80 × 50)', 'Large (104 × 65)', 'Huge (128 × 80)'],
        },
        [true, 'square', 80, 50],
      ]
    );

    closeAll();

    askEarth(transport);
    await settle();

    const civ2 = await playEarth('civ2');

    expect(
      "Civilization II's Earth is its own, in its three sizes, on its own grid",
      [
        civ2.asked,
        civ2.sizes,
        (({ earth, topologyId, width, height }) => [
          earth,
          topologyId,
          width,
          height,
        ])(civ2.options),
      ],
      [
        ['replace', 'choosePluginSet', 'worldSizes'],
        {
          title: 'How big a world?',
          options: ['Small (40 × 50)', 'Normal (50 × 80)', 'Large (75 × 120)'],
        },
        [true, 'staggered-iso', 50, 80],
      ]
    );

    closeAll();

    // A game whose rules have sizes but no Earth: the player is told, and nothing more is asked.
    const withEarth = civ2WorldSizes.sizes.map((size) => size.earth);

    civ2WorldSizes.sizes.forEach((size) => (size.earth = false));
    worker.chosen = 'civ2';

    askEarth(transport);
    await settle();
    choose('civ2');
    await settle();

    expect(
      'Earth for a game whose rules have no Earth says so, in a window',
      openDialogs()
        .filter((dialog) => dialog.classList.contains('notificationWindow'))
        .map((dialog) => text(dialog.querySelector('p'))),
      ['That game couldn’t be set up: it has no Earth map.']
    );

    civ2WorldSizes.sizes.forEach(
      (size, index) => (size.earth = withEarth[index]!)
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
      `${name}: on the isometric grid only, with no grid to choose, and Civ2's own Earth`,
      [
        element.querySelector('select[name=topologyId]') === null,
        Array.from(
          element.querySelectorAll('select[name=map] option'),
          (option) => option.getAttribute('value')
        ).some((value) => (value ?? '').startsWith('earth:')),
        element.querySelectorAll('select[name=difficulty] option').length,
      ],
      [true, true, 6]
    );
    expect(
      `${name}: its sizes are Civ2's own, from its rules, starting on Normal, which is what its inputs hold`,
      [
        Array.from(
          element.querySelectorAll('select[name=map] option'),
          (option) => [option.getAttribute('value'), text(option)]
        ),
        (element.querySelector('select[name=map]') as HTMLSelectElement).value,
        (element.querySelector('input[name=width]') as HTMLInputElement).value,
        (element.querySelector('input[name=height]') as HTMLInputElement).value,
      ],
      [
        [
          ['size:small', 'Small (40 × 50)'],
          ['size:normal', 'Normal (50 × 80)'],
          ['size:large', 'Large (75 × 120)'],
          ['earth:small', 'Earth, Small (40 × 50)'],
          ['earth:normal', 'Earth, Normal (50 × 80)'],
          ['earth:large', 'Earth, Large (75 × 120)'],
        ],
        'size:normal',
        '50',
        '80',
      ]
    );

    // What each level means, in the modern form: the toughest is the last the rules send, whatever it's called.
    if (name === 'modern') {
      const difficulty = element.querySelector(
          'select[name=difficulty]'
        ) as HTMLSelectElement,
        hint = (level: string): string => {
          difficulty.value = level;
          difficulty.dispatchEvent(new Event('change'));

          return text(element.querySelector('.ui-field-hint'));
        };

      expect(
        'modern: under Civ2 the toughest is Deity, and Emperor is only very hard; Chieftain is still the easiest',
        [hint('Chieftain'), hint('Emperor'), hint('Deity')],
        [
          'The easiest level, for learning the game.',
          'A very hard game, for an expert player.',
          'The toughest level, for experts.',
        ]
      );
    }

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

    if (name === 'modern') {
      const difficulty = reopened[0]!.querySelector(
        'select[name=difficulty]'
      ) as HTMLSelectElement;

      difficulty.value = 'Emperor';
      difficulty.dispatchEvent(new Event('change'));

      expect(
        "modern: under Civ1's rules Emperor is the toughest, as it always said",
        text(reopened[0]!.querySelector('.ui-field-hint')),
        'The toughest level, for experts.'
      );
    }

    closeAll();
  }

  // Choosing another game in the setup: the seats go with it; a game that can't be set up leaves the setup for the one
  //  it was; and with nothing to be set up at all, the player is told.
  {
    const { log, transport, worker } = fakeWorkers(),
      setups = () =>
        openDialogs().filter((dialog) =>
          dialog.classList.contains('game-setup-window')
        ),
      switchTo = async (pluginSet: string): Promise<void> => {
        const games = setups()[0]!.querySelector(
          'select[name=pluginSet]'
        ) as HTMLSelectElement;

        games.value = pluginSet;
        games.dispatchEvent(new Event('change'));

        for (let index = 0; index < 5; index++) {
          await settle();
        }
      },
      told = (): string[] =>
        openDialogs()
          .filter((dialog) => dialog.classList.contains('notificationWindow'))
          .map(
            (dialog) =>
              `${text(dialog.querySelector('header')).replace(
                /Close$/,
                ''
              )} / ${text(dialog.querySelector('p'))}`
          );

    closeAll();
    await GameSetupForm.ask(transport, () => {});

    // Civ1's own levels: Chieftain is still the easiest.
    const difficulty = setups()[0]!.querySelector(
      'select[name=difficulty]'
    ) as HTMLSelectElement;

    difficulty.value = 'Chieftain';
    difficulty.dispatchEvent(new Event('change'));

    expect(
      "modern: under Civ1's rules Chieftain is the easiest",
      text(setups()[0]!.querySelector('.ui-field-hint')),
      'The easiest level, for learning the game.'
    );

    const name = setups()[0]!.querySelector(
      'input[name="name"]'
    ) as HTMLInputElement;

    name.value = 'Dom';
    name.dispatchEvent(new Event('input', { bubbles: true }));

    await switchTo('civ2');

    expect(
      'switching to Civ2 keeps the seats: the name typed is still there',
      [
        setups().length,
        (
          setups()[0]?.querySelector(
            'select[name=pluginSet] option[selected]'
          ) as HTMLOptionElement | null
        )?.value,
        (
          setups()[0]?.querySelector(
            'input[name="name"]'
          ) as HTMLInputElement | null
        )?.value,
      ],
      [1, 'civ2', 'Dom']
    );

    // Back, then Civ2 again with the worker refusing it.
    await switchTo('civ1-enhanced');
    worker.refuse = 'civ2';
    log.length = 0;

    await switchTo('civ2');

    expect(
      "a game the worker can't load leaves the setup for the game it was, the worker put back to it",
      [
        setups().length,
        (
          setups()[0]?.querySelector(
            'select[name=pluginSet] option[selected]'
          ) as HTMLOptionElement | null
        )?.value,
        channels(log).filter((channel) =>
          ['replace', 'choosePluginSet'].includes(channel)
        ),
        told(),
      ],
      [1, 'civ1-enhanced', ['replace', 'choosePluginSet'], []]
    );

    // A second change, and Start, while a switch is on its way: neither goes anywhere.
    worker.refuse = null;

    let release = (): void => {};

    worker.hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    const before = setups()[0]!,
      games = before.querySelector(
        'select[name=pluginSet]'
      ) as HTMLSelectElement;

    games.value = 'civ2';
    games.dispatchEvent(new Event('change'));
    await settle();

    const held = [
      games.disabled,
      (before.querySelector('.start') as HTMLButtonElement).disabled,
      (before.querySelector('select[name=difficulty]') as HTMLSelectElement)
        .disabled,
    ];

    // Back to the game it is, and to Civ2 again: with two games, the second switch a held setup would otherwise start.
    games.value = 'civ1-enhanced';
    games.dispatchEvent(new Event('change'));
    games.value = 'civ2';
    games.dispatchEvent(new Event('change'));
    (before.querySelector('.start') as HTMLButtonElement).click();
    before.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
    );
    release();

    for (let index = 0; index < 10; index++) {
      await settle();
    }

    expect(
      'while a switch is on its way the setup is held, and a second change or a start does nothing: one setup, for the game shown, and the worker on it',
      [
        held,
        setups().length,
        (
          setups()[0]?.querySelector(
            'select[name=pluginSet] option[selected]'
          ) as HTMLOptionElement | null
        )?.value,
        worker.chosen,
        channels(log).filter((channel) =>
          ['setOptions', 'start'].includes(channel)
        ),
      ],
      [[true, true, true], 1, 'civ2', 'civ2', []]
    );

    worker.broken = true;

    await switchTo('civ1-enhanced');

    expect(
      'and with nothing to be set up at all, the setup closes and the player is told why, in a window',
      [setups().length, told()],
      [
        0,
        ['Couldn’t set up the game / That game couldn’t be set up: no worker'],
      ]
    );

    closeAll();
  }

  // Civ2's rules' own sizes in the setup (#1175): what a size typed in may be, and how many civilizations it has room for.
  {
    const civilizations = [
        'Babylonian',
        'Roman',
        'Zulu',
        'Greek',
        'Egyptian',
        'Indian',
        'Chinese',
        'Mongol',
        'Aztec',
      ].map((name) => ({ name, leaders: [`${name}Leader`] })),
      setup = new GameSetup({
        aiClients: ['SimpleAIClient'],
        civilizations,
        difficulties: [],
        existing: {},
        worldSizes: civ2WorldSizes,
      } as any);

    expect(
      'a setup for rules with their own sizes is on their grid, at Normal, with their 7 civilizations of the 9 there are, and offers their own Earth',
      [
        setup.fixedGrid(),
        setup.topologyId,
        setup.size?.key,
        [setup.width, setup.height],
        setup.seats.length,
        setup.maxSeats(),
        setup.maps().map(({ value }) => value),
      ],
      [
        'staggered-iso',
        'staggered-iso',
        'normal',
        [50, 80],
        7,
        7,
        [
          'size:small',
          'size:normal',
          'size:large',
          'earth:small',
          'earth:normal',
          'earth:large',
        ],
      ]
    );

    expect(
      "a size typed in is held to the rules' bounds: 20 to 250 each way, 1,000 to 10,000 squares, an even height",
      [
        setup.problem('19', '80'),
        setup.problem('251', '80'),
        setup.problem('50', '18'),
        setup.problem('50', '252'),
        setup.problem('30', '30'),
        setup.problem('100', '102'),
        setup.problem('50', '81'),
        setup.problem('20', '50'),
        setup.problem('100', '100'),
      ],
      [
        {
          field: 'width',
          message: 'CustomizeWorld.width-range',
          data: { min: 20, max: 250 },
        },
        {
          field: 'width',
          message: 'CustomizeWorld.width-range',
          data: { min: 20, max: 250 },
        },
        {
          field: 'height',
          message: 'CustomizeWorld.height-range',
          data: { min: 20, max: 250 },
        },
        {
          field: 'height',
          message: 'CustomizeWorld.height-range',
          data: { min: 20, max: 250 },
        },
        {
          field: 'width',
          message: 'CustomizeWorld.area-range',
          data: { min: 1000, max: 10000 },
        },
        {
          field: 'width',
          message: 'CustomizeWorld.area-range',
          data: { min: 1000, max: 10000 },
        },
        { field: 'height', message: 'CustomizeWorld.even-height' },
        null,
        null,
      ]
    );

    expect(
      'and says so in words',
      [
        i18next.t('CustomizeWorld.width-range', { min: 20, max: 250 }),
        i18next.t('CustomizeWorld.area-range', { min: 1000, max: 10000 }),
      ],
      ['From 20 to 250 squares across.', 'From 1,000 to 10,000 squares in all.']
    );

    setup.setCustomSize(100, 60);

    expect(
      'a size typed in has room for the 7 civilizations the rules allow, not all 9',
      [setup.size, setup.maxSeats(), setup.seats.length],
      [null, 7, 7]
    );

    while (setup.canRemoveSeat()) {
      setup.removeSeat(setup.seats.length - 1);
    }

    expect(
      'and no fewer seats than the 3 civilizations the rules need at least',
      [setup.seats.length, setup.minSeats()],
      [3, 3]
    );

    expect(
      'a size chosen is one of the rules’ own, by its key',
      (setup.chooseMap('size:small'),
      [setup.size?.key, setup.width, setup.height]),
      ['small', 40, 50]
    );
  }

  // Another game's seats, fewer than the rules here need (#1175): computer seats are added up to their fewest.
  {
    const setup = new GameSetup(
      {
        aiClients: ['SimpleAIClient'],
        civilizations: ['Roman', 'Greek', 'Zulu', 'Aztec'].map((name) => ({
          name,
          leaders: [`${name}Leader`],
        })),
        difficulties: [],
        existing: {},
        worldSizes: civ2WorldSizes,
      } as any,
      { seats: [{ kind: 'human', name: 'Dom' }] }
    );

    expect(
      "one carried seat, where the rules need three, gains two computer seats, and Civ1's rules still allow one",
      [
        setup.seats.map(({ kind, name }) => `${kind}:${name}`),
        new GameSetup(
          {
            aiClients: ['SimpleAIClient'],
            civilizations: [{ name: 'Roman', leaders: ['JuliusCaesar'] }],
            difficulties: [],
            existing: {},
          } as any,
          { seats: [{ kind: 'human', name: 'Dom' }] }
        ).minSeats(),
      ],
      [['human:Dom', 'computer:', 'computer:'], 1]
    );
  }

  // Civ2's Earth in the setup (#1176): on its own grid, in its sizes; and none from rules whose sizes have no Earth.
  {
    const data = (worldSizes: unknown) =>
        ({
          aiClients: ['SimpleAIClient'],
          civilizations: [{ name: 'Roman', leaders: ['JuliusCaesar'] }],
          difficulties: [],
          existing: {},
          worldSizes,
        } as any),
      setup = new GameSetup(data(civ2WorldSizes), { earth: true });

    expect(
      'a setup opened on Earth for rules with their own Earth is on it, on their grid',
      [setup.earth, setup.topologyId, setup.map(), setup.width, setup.height],
      [true, 'staggered-iso', 'earth:normal', 50, 80]
    );

    setup.chooseMap('earth:large');

    expect(
      'choosing another of their Earth sizes stays on their grid, and is still Earth',
      [setup.earth, setup.topologyId, setup.width, setup.height],
      [true, 'staggered-iso', 75, 120]
    );

    setup.chooseMap('size:small');

    expect(
      'and one of their sizes is not Earth',
      [setup.earth, setup.topologyId, setup.map()],
      [false, 'staggered-iso', 'size:small']
    );

    const noEarth = new GameSetup(
      data({
        ...civ2WorldSizes,
        sizes: civ2WorldSizes.sizes.map((size) => ({ ...size, earth: false })),
      }),
      { earth: true }
    );

    expect(
      'rules whose sizes have no Earth offer none, and a setup asked for Earth opens on their sizes',
      [
        noEarth.earth,
        noEarth.maps().some(({ group }) => group === 'earth'),
        noEarth.map(),
      ],
      [false, false, 'size:normal']
    );
  }

  // Another game's seats where this one has less room: the human's is kept.
  {
    const setup = new GameSetup(
      {
        aiClients: ['SimpleAIClient'],
        civilizations: [
          { name: 'Babylonian', leaders: ['Hammurabi'] },
          { name: 'Roman', leaders: ['JuliusCaesar'] },
          { name: 'Zulu', leaders: ['Shaka'] },
        ],
        difficulties: [],
        existing: {},
      } as any,
      {
        seats: [
          { kind: 'computer', name: '' },
          { kind: 'computer', name: '' },
          { kind: 'computer', name: '' },
          { kind: 'computer', name: '' },
          { kind: 'human', name: 'Dom' },
        ],
      }
    );

    expect(
      "carried seats beyond the new game's room keep the human's, in place of the last that fits",
      setup.seats.map(({ kind, name }) => `${kind}:${name}`),
      ['computer:', 'computer:', 'human:Dom']
    );
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
