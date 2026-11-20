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

// What each game was last started with (#1247), kept as a browser keeps it.
const stored = new Map<string, string>();

(globalThis as any).localStorage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
};

const noSetup = (): void => {};
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
import {
  gameChoices,
  mayOfferOtherGames,
  preselectedGame,
} from '@civ-clone/ui-menus/lib/pluginSets';

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
  closeAll = () => openDialogs().forEach((dialog) => dialog.remove()),
  // The setup's games (#1248): a card each, and the chosen game's Original and Enhanced rules beneath it.
  gameCards = (root: Element | undefined): HTMLInputElement[] =>
    Array.from(root?.querySelectorAll('input[name=rule-game]') ?? []),
  // The set the setup is for: its rules' radio button where the game has two, and its card's otherwise.
  setupSet = (root: Element | undefined): string | undefined =>
    (
      [
        ...(root?.querySelectorAll<HTMLInputElement>(
          'input[name=rule-variant]'
        ) ?? []),
      ].find(({ checked }) => checked) ??
      gameCards(root).find(({ checked }) => checked)
    )?.value,
  // Ticks or clears the rule set `id`'s checkbox in the setup, as a player does.
  tick2 = (root: Element, id: string): void => {
    const box = root.querySelector(
      `input[data-rule-set="${id}"]`
    ) as HTMLInputElement;

    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
  },
  // Picks the set `id` in the setup, as a player does: its rules' radio button, or its game's card.
  pickSet = (root: Element, id: string): HTMLInputElement => {
    const control = [
      ...root.querySelectorAll<HTMLInputElement>(
        'input[name=rule-variant], input[name=rule-game]'
      ),
    ].find(({ value }) => value === id)!;

    control.checked = true;
    control.dispatchEvent(new Event('change'));

    return control;
  };

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
      // A rule set the rule sets' answer says is in a conflict, when given (#954).
      conflict: null as string | null,
      // The rule sets' answer waits on it, when given.
      holdRules: null as Promise<void> | null,
    },
    // Each with its art in the order it prefers it, as civ.one's are: Civ2's own, then the isometric pixel art.
    sets = [
      { id: 'civ1', tilesets: [] as string[], original: null },
      // Civ1 with civ.one's fixes and additions, whose original rules are `civ1` (#1248).
      { id: 'civ1-enhanced', tilesets: [] as string[], original: 'civ1' },
      { id: 'civ2', tilesets: ['civ2', 'iso-pixelart'], original: null },
      // Civ2 with civ.one's fixes, whose original rules are `civ2` (#1248).
      {
        id: 'civ2-enhanced',
        tilesets: ['civ2', 'iso-pixelart'],
        original: 'civ2',
      },
    ],
    levels = {
      civ1: ['Chieftain', 'Warlord', 'Prince', 'King', 'Emperor'],
      'civ1-enhanced': ['Chieftain', 'Warlord', 'Prince', 'King', 'Emperor'],
      civ2: ['Chieftain', 'Warlord', 'Prince', 'King', 'Emperor', 'Deity'],
      'civ2-enhanced': [
        'Chieftain',
        'Warlord',
        'Prince',
        'King',
        'Emperor',
        'Deity',
      ],
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
                .map(({ id, tilesets, original }) => ({
                  id,
                  tilesets,
                  original,
                  tileset:
                    tilesets.find((tileset) =>
                      (args as string[]).includes(tileset)
                    ) ?? null,
                }))
                .filter(
                  ({ tilesets, tileset }) =>
                    tilesets.length === 0 || tileset !== null
                )
                .map(({ id, tileset, original }) => ({
                  id,
                  tileset,
                  original,
                })),
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
          // Civ1's own set, and with its enhanced rules, their set with one of its fixes (#1248).
          // The choices it is asked with and the one change, as the sets it knows hold them.
          case 'ruleSets': {
            const query = args as {
                choices: { id: string; value: boolean }[];
                change?: { id: string; value: boolean };
              } | null,
              known =
                load() === 'civ1-enhanced'
                  ? [
                      'civ1-enhanced',
                      'civ1-enhanced:obsolete-builds',
                      'civ1-enhanced:ages',
                      'civ1-enhanced:research-cost-by-age',
                      'civ1-unit:obsolescence',
                    ]
                  : load() === 'civ1'
                  ? ['civ1-unit:obsolescence']
                  : [],
              choices = [
                ...(query?.choices ?? []),
                ...(query?.change ? [query.change] : []),
              ]
                .filter(({ id }) => known.includes(id))
                // The last word on each.
                .filter(
                  ({ id }, index, all) =>
                    !all.slice(index + 1).some((later) => later.id === id)
                ),
              set = (id: string, members: any[] = [], state?: 'mixed') => ({
                id,
                kind: 'set',
                state:
                  state ??
                  (choices.find((choice) => choice.id === id)?.value === false
                    ? 'off'
                    : 'on'),
                active: true,
                switchable: true,
                members,
              }),
              own = set('civ1-unit:obsolescence');

            return (worker.holdRules ?? Promise.resolve()).then(() => ({
              sets:
                load() === 'civ1-enhanced'
                  ? [
                      set('civ1-enhanced', [
                        set('civ1-enhanced:obsolete-builds'),
                        // Some of what is beneath it on.
                        set(
                          'civ1-enhanced:ages',
                          [set('civ1-enhanced:research-cost-by-age')],
                          'mixed'
                        ),
                      ]),
                      own,
                    ]
                  : load() === 'civ1'
                  ? [own]
                  : [],
              choices,
              problems:
                worker.conflict === null
                  ? []
                  : [
                      {
                        kind: 'conflict',
                        ids: [worker.conflict, 'civ1-unit:obsolescence'],
                        message: 'They conflict.',
                        blocking: true,
                      },
                    ],
            }));
          }
          // Civ2's rules offer their own sizes, as civ2-world registers them (#1175); Civ1's offer none.
          case 'worldSizes':
            return Promise.resolve(
              load().startsWith('civ2')
                ? civ2WorldSizes
                : { sizes: [], custom: null }
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

  // Without Civ2's art: nothing new is asked of the worker, and New Game offers the one game (#1247).
  {
    const { log, transport } = fakeWorkers();

    expect(
      "without art beyond Civ1's there's no other game to offer",
      mayOfferOtherGames(),
      false
    );

    askNewGame(transport, undefined, noSetup);
    await settle();

    expect(
      'New Game asks the worker nothing, and offers Civilization and Customize…',
      [channels(log), shown()],
      [
        [],
        {
          title: 'Which game?',
          options: [
            'Civilization: A normal world on the square grid, 7 civilizations',
            'Customize…',
          ],
        },
      ]
    );

    closeAll();

    const setup = await GameSetupWindow.ask(transport);

    expect(
      'and the setup asks only what it always has, with no game to choose',
      [channels(log), gameCards(setup.element()).length === 0],
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

    askNewGame(transport, undefined, noSetup);
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
          options: [
            'Civilization: A normal world on the square grid, 7 civilizations',
            'Civilization II (preview): A normal world on the isometric grid, 7 civilizations',
            'Customize…',
          ],
        },
      ]
    );

    choose('civ2-enhanced');
    await settle();

    expect(
      'Civ2 is loaded and played on the isometric grid, drawn with the isometric pixel art: no grid or size asked, only the difficulty',
      [
        log.slice(1),
        worker.chosen,
        mapTileset('staggered-iso').id,
        shown().title,
      ],
      [
        [
          ['choosePluginSet', 'civ2-enhanced'],
          ['worldSizes', null],
          ['difficulties', null],
        ],
        'civ2-enhanced',
        'iso-pixelart',
        'Difficulty level',
      ]
    );

    closeAll();
  }

  installTilesets({ civ2: { complete: true, metadata: civ2Metadata } });

  // With it: which game first.
  {
    const { log, transport, worker } = fakeWorkers();

    expect("with Civ2's art imported there may be", mayOfferOtherGames(), true);

    stored.clear();
    askNewGame(transport, undefined, noSetup);
    await settle();

    expect(
      'New Game offers each game, saying what it starts with, then Customize…, after asking with the art imported',
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
          options: [
            'Civilization: A normal world on the square grid, 7 civilizations',
            'Civilization II (preview): A normal world on the isometric grid, 7 civilizations',
            'Customize…',
          ],
        },
      ]
    );

    choose('civ2-enhanced');
    await settle();

    expect(
      'Civ2 is loaded in the worker, and asks only the difficulty, its six levels, with Prince selected',
      [
        log.slice(1),
        worker.chosen,
        shown().title,
        shown().options.length,
        latest().querySelector('option[selected]')?.getAttribute('value'),
      ],
      [
        [
          ['choosePluginSet', 'civ2-enhanced'],
          ['worldSizes', null],
          ['difficulties', null],
        ],
        'civ2-enhanced',
        'Difficulty level',
        6,
        'Prince',
      ]
    );

    choose('Prince');
    await settle();
    await settle();

    const started = () =>
      (({ topologyId, width, height, players, difficulty }) => [
        topologyId,
        width,
        height,
        players,
        difficulty,
      ])(
        log.find(([channel]) => channel === 'setOptions')?.[1] as {
          [key: string]: unknown;
        }
      );

    expect(
      "and the game starts on Civ2's own grid at its Normal size, with its 7 civilizations",
      started(),
      ['staggered-iso', 50, 80, 7, 'Prince']
    );
    expect(
      'and is kept for next time',
      JSON.parse(stored.get('civ.newGame') ?? '{}'),
      {
        'civ2-enhanced': {
          topologyId: 'staggered-iso',
          size: 'normal',
          players: 7,
        },
      }
    );

    closeAll();
    log.length = 0;

    // Civilization last started on a large hex world with 12 civilizations, more than a large world has room for, and
    //  Civilization II on a small world with 7, which its own small world has room for, if the page's doesn't.
    stored.set(
      'civ.newGame',
      JSON.stringify({
        'civ2-enhanced': {
          topologyId: 'staggered-iso',
          size: 'small',
          players: 7,
        },
        'civ1-enhanced': {
          topologyId: 'hex-odd-r',
          size: 'large',
          players: 12,
        },
      })
    );

    // Civilization now: the worker has Civ2's plugins, so it is replaced, and the new one loads the default as always.
    askNewGame(transport, undefined, noSetup);
    await settle();

    expect(
      'asked again, New Game starts on the game chosen last, each saying what it starts with as last time',
      [
        latest().querySelector('option[selected]')?.getAttribute('value'),
        shown().options.slice(0, 2),
      ],
      [
        'civ2-enhanced',
        [
          'Civilization: A large world on the hex grid, 10 civilizations',
          'Civilization II (preview): A small world on the isometric grid, 7 civilizations',
        ],
      ]
    );

    choose('civ1-enhanced');
    await settle();

    expect(
      "choosing Civilization after Civ2 replaces the worker, asks the new one for its sizes, of which Civ1's rules have none, and then the difficulty",
      [log.slice(1), worker.chosen, shown().title],
      [
        [
          ['replace', 'civ2-enhanced'],
          ['worldSizes', null],
          ['difficulties', null],
        ],
        'civ1-enhanced',
        'Difficulty level',
      ]
    );

    choose('Prince');
    await settle();
    await settle();

    expect(
      'and it starts on the grid and size it had last, with as many civilizations as that size has room for',
      started(),
      ['hex-odd-r', 97, 70, 10, 'Prince']
    );

    closeAll();

    // Earth with Civ2 to play (#1176): which game first, then that game's Earth.
    worker.chosen = 'civ2-enhanced';
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
        'civ2-enhanced',
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

    const civ2 = await playEarth('civ2-enhanced');

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
    worker.chosen = 'civ2-enhanced';

    askEarth(transport);
    await settle();
    choose('civ2-enhanced');
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
      element = setup.element();

    expect(
      `${name}: the setup for Civ2's original rules has the games to choose, Civilization II chosen, on its Original rules, and loads them before asking the rest`,
      [
        gameCards(element).map((card) => [
          card.value,
          text(card.closest('label')),
          card.checked,
        ]),
        setupSet(element),
        channels(log).slice(0, 3),
        worker.chosen,
      ],
      [
        [
          ['civ1-enhanced', 'Civilization', false],
          ['civ2-enhanced', 'Civilization II (preview)', true],
        ],
        'civ2',
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

    // Civ2's Earth, at its Small (#1248): Civilization's Earth has no Small, and is square.
    const map = element.querySelector('select[name=map]') as HTMLSelectElement;

    map.value = 'earth:small';
    map.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    log.length = 0;

    pickSet(element, 'civ1-enhanced');

    for (let index = 0; index < 5; index++) {
      await settle();
    }

    const reopened = openDialogs().filter((dialog) =>
      dialog.classList.contains('game-setup-window')
    );

    expect(
      `${name}: choosing Civilization replaces the worker and opens the setup again for it, with Earth and its five levels`,
      [
        channels(log).slice(0, 2),
        reopened.length,
        setupSet(reopened[0]),
        Array.from(
          reopened[0]?.querySelectorAll('select[name=map] option') ?? [],
          (option) => option.getAttribute('value')
        ).some((value) => (value ?? '').startsWith('earth:')),
        reopened[0]?.querySelectorAll('select[name=difficulty] option').length,
      ],
      [['pluginSets', 'replace'], 1, 'civ1-enhanced', true, 5]
    );
    expect(
      `${name}: Civ2's Earth at its Small switched to Civilization is Civilization's own Earth, on the square grid, at its own size, and no grid of Civ2's is carried`,
      [
        (reopened[0]?.querySelector('select[name=map]') as HTMLSelectElement)
          ?.value,
        (
          reopened[0]?.querySelector(
            'select[name=topologyId]'
          ) as HTMLSelectElement | null
        )?.value,
      ],
      ['earth:normal', 'square']
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

  // A game's Original and Enhanced rules (#1248), both interfaces': beneath the chosen game's card, Enhanced to start
  //  with and its own fixes beneath it; Original is the game's original set, another setup on a worker of its own,
  //  under the same card.
  for (const [name, Setup] of [
    ['classic', GameSetupWindow],
    ['modern', GameSetupForm],
  ] as const) {
    const { log, transport, worker } = fakeWorkers(),
      setups = () =>
        openDialogs().filter((dialog) =>
          dialog.classList.contains('game-setup-window')
        ),
      variants = (root: Element | undefined) =>
        Array.from(
          root?.querySelectorAll<HTMLInputElement>(
            'input[name=rule-variant]'
          ) ?? [],
          (control) => [
            control.value,
            text(control.closest('label')),
            control.checked,
          ]
        ),
      // The rule sets drawn beneath Enhanced, and those after it.
      beneath = (root: Element | undefined) => [
        Array.from(
          root?.querySelectorAll('.rule-variant-sets .rule-set-name') ?? [],
          text
        ),
        Array.from(
          root?.querySelectorAll(
            '.rule-game-rules > div > .rule-sets > .rule-set > label .rule-set-name'
          ) ?? [],
          text
        ),
      ];

    closeAll();
    await Setup.ask(transport, () => {});

    expect(
      `${name}: Civilization is chosen, on its Enhanced rules, with their fixes beneath and its own set after`,
      [
        gameCards(setups()[0]).map((card) => [
          card.value,
          text(card.closest('label')),
          card.checked,
        ]),
        variants(setups()[0]),
        beneath(setups()[0]),
        // The enhanced rules' own set is Enhanced, not a checkbox of its own; its changes are folded beneath it.
        setups()[0]?.querySelector('[data-rule-set="civ1-enhanced"]') ?? null,
        text(
          setups()[0]?.querySelector('.rule-variant-changes > summary') ?? null
        ),
      ],
      [
        [
          ['civ1-enhanced', 'Civilization', true],
          ['civ2-enhanced', 'Civilization II (preview)', false],
        ],
        [
          ['civ1', 'Original rules', false],
          ['civ1-enhanced', 'Enhanced rules', true],
        ],
        [
          [
            'civ1-enhanced:obsolete-builds',
            'civ1-enhanced:ages',
            'civ1-enhanced:research-cost-by-age',
          ],
          ['civ1-unit:obsolescence'],
        ],
        null,
        // One with only some of what is beneath it on counts as on.
        'Changes from the original: 2 of 2 on',
      ]
    );

    // What the player has set before switching: the map, the level, the land, the first seat's civilization and the
    //  second's AI, a change switched off under Enhanced, and a set both rules have switched off.
    const before = setups()[0]!,
      field = <T extends HTMLElement>(selector: string): T =>
        before.querySelector(selector) as T,
      changeTo = (selector: string, value: string): void => {
        const element = field<HTMLSelectElement | HTMLInputElement>(selector);

        element.value = value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('input', { bubbles: true }));
      },
      tick = (id: string): void => {
        const box = field<HTMLInputElement>(`input[data-rule-set="${id}"]`);

        box.checked = !box.checked;
        box.dispatchEvent(new Event('change'));
      };

    changeTo('select[name=map]', 'size:large');
    changeTo('select[name=difficulty]', 'King');
    changeTo('input[name=landCoverage]', '0.55');
    tick('civ1-enhanced:obsolete-builds');
    tick('civ1-unit:obsolescence');
    await settle();

    const seatSelects = (root: Element, name: string) =>
      Array.from(
        root.querySelectorAll<HTMLSelectElement>(`select[name^="${name}"]`)
      );

    changeTo('select[name^="civilization"]', 'Roman');
    await settle();

    // The test page's `focus` does nothing: what is focused is noted instead.
    //  Every element's, the dialogs' too: closing a window focuses the one beneath it, and the radio button has to be
    //  the last thing focused.
    const elementFocus = HTMLElement.prototype.focus,
      ownInputFocus = Object.prototype.hasOwnProperty.call(
        HTMLInputElement.prototype,
        'focus'
      )
        ? HTMLInputElement.prototype.focus
        : null;
    let focused: HTMLElement | null = null;

    HTMLElement.prototype.focus = function (this: HTMLElement) {
      focused = this;
    };

    if (ownInputFocus !== null) {
      HTMLInputElement.prototype.focus = HTMLElement.prototype.focus;
    }

    expect(
      `${name}: the changes are folded until there is a problem about one of them`,
      setups()[0]?.querySelector('.rule-variant-changes')?.hasAttribute('open'),
      false
    );

    log.length = 0;
    pickSet(setups()[0]!, 'civ1');

    for (let index = 0; index < 5; index++) {
      await settle();
    }

    const after = setups()[0]!,
      value = (selector: string): string | undefined =>
        (after.querySelector(selector) as HTMLInputElement | null)?.value;

    expect(
      `${name}: switching to Original keeps the map, the level, the land, the seat's civilization and the set both have switched off, and the keyboard is back on Original rules`,
      [
        value('select[name=map]'),
        value('select[name=difficulty]'),
        value('input[name=landCoverage]'),
        seatSelects(after, 'civilization')[0]?.value,
        (
          after.querySelector(
            'input[data-rule-set="civ1-unit:obsolescence"]'
          ) as HTMLInputElement | null
        )?.checked,
        (focused as HTMLInputElement | null)?.value,
        (focused as HTMLInputElement | null)?.name,
        (focused as HTMLInputElement | null)?.isConnected,
      ],
      [
        'size:large',
        'King',
        '0.55',
        'Roman',
        false,
        'civ1',
        'rule-variant',
        true,
      ]
    );

    HTMLElement.prototype.focus = elementFocus;

    if (ownInputFocus !== null) {
      HTMLInputElement.prototype.focus = ownInputFocus;
    }

    expect(
      `${name}: Original rules is Civ1's original set, on a worker of its own, still under the Civilization card, with only its own set`,
      [
        channels(log).filter((channel) =>
          ['replace', 'choosePluginSet'].includes(channel)
        ),
        worker.chosen,
        setups().length,
        gameCards(setups()[0])
          .filter(({ checked }) => checked)
          .map(({ value }) => value),
        variants(setups()[0]),
        beneath(setups()[0]),
      ],
      [
        ['replace', 'choosePluginSet'],
        'civ1',
        1,
        ['civ1-enhanced'],
        [
          ['civ1', 'Original rules', true],
          ['civ1-enhanced', 'Enhanced rules', false],
        ],
        [[], ['civ1-unit:obsolescence']],
      ]
    );

    pickSet(setups()[0]!, 'civ1-enhanced');

    for (let index = 0; index < 5; index++) {
      await settle();
    }

    expect(
      `${name}: and Enhanced rules back again, the change switched off under Enhanced still off after the look at Original`,
      [
        worker.chosen,
        setupSet(setups()[0]),
        (
          setups()[0]?.querySelector(
            'input[data-rule-set="civ1-enhanced:obsolete-builds"]'
          ) as HTMLInputElement | null
        )?.checked,
      ],
      ['civ1-enhanced', 'civ1-enhanced', false]
    );

    // A change switched and Original picked at once, before the change is answered: the switch waits for it, so the
    //  change goes with the setup for Original, as the player left it.
    let releaseRules = (): void => {};

    worker.holdRules = new Promise<void>((resolve) => {
      releaseRules = resolve;
    });
    log.length = 0;
    tick2(setups()[0]!, 'civ1-enhanced:ages');
    pickSet(setups()[0]!, 'civ1');
    await settle();
    worker.holdRules = null;
    releaseRules();

    for (let index = 0; index < 5; index++) {
      await settle();
    }

    expect(
      `${name}: switching while a change is on its way waits for it, and the change goes with the switch`,
      [
        worker.chosen,
        (
          log.filter(([channel]) => channel === 'ruleSets').pop()?.[1] as {
            choices: { id: string; value: boolean }[];
          } | null
        )?.choices.some(
          // Some of it on, so ticking it switches it all on.
          ({ id, value }) => id === 'civ1-enhanced:ages' && value === true
        ),
      ],
      ['civ1', true]
    );

    pickSet(setups()[0]!, 'civ1-enhanced');

    for (let index = 0; index < 5; index++) {
      await settle();
    }

    // A rule ticked while a switch waits on the other game's worker: held, and nothing is asked of the worker; nor after
    //  a change answered meanwhile is drawn again.
    let releaseSwitch = (): void => {};

    worker.hold = new Promise<void>((resolve) => {
      releaseSwitch = resolve;
    });
    worker.holdRules = new Promise<void>((resolve) => {
      releaseRules = resolve;
    });
    tick2(setups()[0]!, 'civ1-enhanced:obsolete-builds');
    pickSet(setups()[0]!, 'civ1');
    worker.holdRules = null;
    releaseRules();

    for (let index = 0; index < 5; index++) {
      await settle();
    }

    const waiting = setups()[0]!,
      box = waiting.querySelector(
        'input[data-rule-set="civ1-enhanced:obsolete-builds"]'
      ) as HTMLInputElement;

    log.length = 0;
    tick2(waiting, 'civ1-enhanced:obsolete-builds');
    await settle();

    expect(
      `${name}: while a switch waits, the rules are held, drawn again held, and a tick reaches no worker`,
      [box.disabled, channels(log).filter((channel) => channel === 'ruleSets')],
      [true, []]
    );

    worker.hold = null;
    releaseSwitch();

    for (let index = 0; index < 5; index++) {
      await settle();
    }

    pickSet(setups()[0]!, 'civ1-enhanced');

    for (let index = 0; index < 5; index++) {
      await settle();
    }

    // Closed while the switch waits, on the rule sets or on the other game: nothing opens in its place.
    for (const waitOn of ['rules', 'game'] as const) {
      let release = (): void => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });

      if (waitOn === 'rules') {
        worker.holdRules = held;
        tick2(setups()[0]!, 'civ1-enhanced:obsolete-builds');
      } else {
        worker.hold = held;
      }

      log.length = 0;
      pickSet(setups()[0]!, 'civ1');
      await settle();
      (
        setups()[0]!.querySelector('header .close') as HTMLButtonElement
      ).click();
      worker.holdRules = null;
      worker.hold = null;
      release();

      for (let index = 0; index < 10; index++) {
        await settle();
      }

      expect(
        `${name}: closed while the switch waits on the ${
          waitOn === 'rules' ? 'rule sets' : 'other game'
        }, no setup opens in its place`,
        setups().length,
        0
      );

      closeAll();
      await Setup.ask(transport, () => {}, { pluginSet: 'civ1-enhanced' });
      await settle();
    }

    // A change that conflicts with another: the fold opens on it.
    worker.conflict = 'civ1-enhanced:obsolete-builds';
    tick2(setups()[0]!, 'civ1-unit:obsolescence');

    for (let index = 0; index < 5; index++) {
      await settle();
    }

    expect(
      `${name}: a problem about a folded change opens the fold`,
      setups()[0]?.querySelector('.rule-variant-changes')?.hasAttribute('open'),
      true
    );

    worker.conflict = null;

    closeAll();
  }

  // New Game offers each game once (#1248, the first part of #1247): a set that is another's original rules is
  //  offered beneath that game in the setup, and not as a game of its own, while a save of it still names it.
  {
    const choices = gameChoices({
      sets: [
        { id: 'civ1', tileset: null, original: null },
        { id: 'civ1-enhanced', tileset: null, original: 'civ1' },
        { id: 'civ2', tileset: 'iso-pixelart', original: null },
        { id: 'civ2-enhanced', tileset: 'iso-pixelart', original: 'civ2' },
      ],
      default: 'civ1-enhanced',
      chosen: 'civ2',
    });

    expect(
      'New Game offers Civilization and Civilization II by their enhanced rules, and every set is still there to load',
      [
        choices.games.map(({ id }) => id),
        choices.sets.map(({ id }) => id),
        choices.chosen,
      ],
      [
        ['civ1-enhanced', 'civ2-enhanced'],
        ['civ1', 'civ1-enhanced', 'civ2', 'civ2-enhanced'],
        'civ2',
      ]
    );
    expect(
      "with Civ2's original rules chosen last, New Game starts on Civilization II, and the setup on its Original rules",
      [
        preselectedGame(choices),
        preselectedGame(choices, undefined, choices.sets),
        preselectedGame(choices, 'civ1'),
      ],
      ['civ2-enhanced', 'civ2', 'civ1-enhanced']
    );
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
        pickSet(setups()[0]!, pluginSet);

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

    await switchTo('civ2-enhanced');

    expect(
      'switching to Civ2 keeps the seats: the name typed is still there',
      [
        setups().length,
        setupSet(setups()[0]),
        (
          setups()[0]?.querySelector(
            'input[name="name"]'
          ) as HTMLInputElement | null
        )?.value,
      ],
      [1, 'civ2-enhanced', 'Dom']
    );

    // Back, then Civ2 again with the worker refusing it.
    await switchTo('civ1-enhanced');
    worker.refuse = 'civ2-enhanced';
    log.length = 0;

    await switchTo('civ2-enhanced');

    expect(
      "a game the worker can't load leaves the setup for the game it was, the worker put back to it",
      [
        setups().length,
        setupSet(setups()[0]),
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
      civ2 = pickSet(before, 'civ2-enhanced');

    await settle();

    const held = [
      civ2.disabled,
      (before.querySelector('.start') as HTMLButtonElement).disabled,
      (before.querySelector('select[name=difficulty]') as HTMLSelectElement)
        .disabled,
    ];

    // Back to the game it is, and to Civ2 again: with two games, the second switch a held setup would otherwise start.
    pickSet(before, 'civ1-enhanced');
    pickSet(before, 'civ2-enhanced');
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
        setupSet(setups()[0]),
        worker.chosen,
        channels(log).filter((channel) =>
          ['setOptions', 'start'].includes(channel)
        ),
      ],
      [[true, true, true], 1, 'civ2-enhanced', 'civ2-enhanced', []]
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

  // What a switch carries (#1248): the player's grid between games played on any, never a grid of a game's own, and
  //  never a size typed in onto a game with a grid of its own.
  {
    const data = (worldSizes?: unknown) =>
        ({
          aiClients: ['SimpleAIClient'],
          civilizations: [{ name: 'Roman', leaders: ['JuliusCaesar'] }],
          difficulties: [],
          existing: {},
          ...(worldSizes === undefined ? {} : { worldSizes }),
        } as any),
      civ1 = new GameSetup(data(), {
        topologyId: 'staggered-iso',
        map: 'size:large',
      }),
      civ2 = new GameSetup(data(civ2WorldSizes), {
        topologyId: 'square',
        map: 'custom',
        width: 30,
        height: 30,
      });

    expect(
      "the player's grid and size are carried to a game on any grid; a game with a grid of its own keeps it, and a size typed in isn't carried to it",
      [
        [civ1.topologyId, civ1.map()],
        [civ2.topologyId, civ2.map()],
        'topologyId' in civ2.carried(),
        civ1.carried().topologyId,
      ],
      [
        ['staggered-iso', 'size:large'],
        ['staggered-iso', 'size:normal'],
        false,
        'staggered-iso',
      ]
    );

    // A size typed in on Civ2's grid isn't carried out of it either: its shape is that grid's.
    const civ2Custom = new GameSetup(data(civ2WorldSizes));

    civ2Custom.setCustomSize(40, 100);

    const fromCiv2 = new GameSetup(data(), civ2Custom.carried());

    expect(
      "a size typed in on Civ2's own grid isn't carried to Civilization: it opens on its own default map",
      [
        'map' in civ2Custom.carried(),
        fromCiv2.map(),
        [fromCiv2.width, fromCiv2.height],
      ],
      [false, 'size:normal', [80, 50]]
    );

    // Earth: carried to the other game's Earth nearest in area, on that Earth's grid, whatever grid was carried.
    const civ1Huge = new GameSetup(data(), { earth: true });

    civ1Huge.chooseMap('earth:huge');

    const civ2Earth = new GameSetup(data(civ2WorldSizes), civ1Huge.carried()),
      civ1Earth = new GameSetup(data(), {
        earth: true,
        topologyId: 'hex-odd-r',
        map: 'earth:small',
        width: 40,
        height: 50,
      });

    expect(
      "Civilization's Earth at Huge is Civ2's Earth at Large, the nearest; Earth with a hex grid carried is Civilization's Earth on the square grid",
      [
        [civ1Huge.map(), civ2Earth.map(), civ2Earth.topologyId],
        [civ1Earth.map(), civ1Earth.topologyId],
      ],
      [
        ['earth:huge', 'earth:large', 'staggered-iso'],
        ['earth:normal', 'square'],
      ]
    );

    // There and back, each setup opened with what the one before carried (`...preset`, as the forms open them): the size
    //  by name and the rules switched come back, and Civilization is back on the grid the player chose for it: Civ2's
    //  own grid isn't carried, and the player's choice passes through Civ2's setup untouched.
    const startPreset = {
        topologyId: 'hex-odd-r' as const,
        map: 'size:large',
        ruleSetChoices: [{ id: 'civ1-enhanced:ages', value: true }],
      },
      start = new GameSetup(data(), startPreset),
      therePreset = { ...startPreset, ...start.carried(startPreset) },
      there = new GameSetup(data(civ2WorldSizes), therePreset),
      backPreset = { ...therePreset, ...there.carried(therePreset) },
      back = new GameSetup(data(), backPreset);

    expect(
      "Civilization to Civ2 and back: the size by name and the rules switched come back, and Civilization is on the player's grid again, not Civ2's",
      [
        [start.topologyId, start.map()],
        [there.topologyId, there.map()],
        [back.topologyId, back.map()],
        backPreset.ruleSetChoices,
      ],
      [
        ['hex-odd-r', 'size:large'],
        ['staggered-iso', 'size:large'],
        ['hex-odd-r', 'size:large'],
        [{ id: 'civ1-enhanced:ages', value: true }],
      ]
    );
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
