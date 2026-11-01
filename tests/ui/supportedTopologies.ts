// The map grid a new game is on (#89). Only the grids that can be drawn are offered: the installed tilesets' that have
// a projection (#92). While that is only Civ1's square the question answers itself and is never shown, so New Game
// opens on the world sizes as it always has; the grid still goes to the engine as `topologyId`, and Earth (square only)
// never asks. Each grid has its own sizes: square's are New Game's own, isometric's are half as wide and twice as tall,
// hex's are as tabled, and both of those have even heights. The game setup refuses a size the grid cannot be. The UI
// builds a world's topology from the grid it says it is on, square when it does not say.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import topologyFor, {
  TopologyId,
  topologyName,
} from '../../src/js/UI/lib/topologyFor';
import worldSizes, {
  customSizeProblem,
  earthWorldSizes,
  worldSizesFor,
} from '../../src/js/UI/lib/worldSizes';
import supportedTopologies, {
  isSupportedTopology,
} from '../../src/js/UI/lib/supportedTopologies';
import GameSetupWindow from '../../src/js/UI/components/GameSetupWindow';
import HexOddRTopology from '@civ-clone/core-world/HexOddRTopology';
import {
  askEarth,
  askMapGrid,
  askNewGame,
} from '../../src/js/UI/components/newGame';
import Request from '../../src/js/Engine/Request';
import SquareTopology from '@civ-clone/core-world/SquareTopology';
import StaggeredIsoTopology from '@civ-clone/core-world/StaggeredIsoTopology';
import Transport from '../../src/js/UI/Transport';
import civ1Json from '../../src/js/UI/tilesets/civ1.json';
import i18next from 'i18next';
import { drawableGrids } from '../../src/js/UI/lib/projectionFor';
import { installedTilesets } from '../../src/js/UI/lib/tilesets';
import validateDescriptor from '../../src/js/UI/tilesets/TilesetDescriptor';

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
      `FAIL supportedTopologies: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

// linkedom's `<select>` `value` is read-only, where a browser's selects the option: the windows set it.
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

const threw = (fn: () => unknown): boolean => {
  try {
    fn();

    return false;
  } catch {
    return true;
  }
};

// What the windows ask the worker, and what they send it.
const requests: [string, unknown][] = [],
  sent: [string, unknown][] = [],
  transport = {
    request: (request: Request): Promise<unknown> => {
      const [args] = request.args();

      requests.push([request.channel(), args]);

      // No difficulty levels, so that question answers itself; no options set before.
      return Promise.resolve(request.channel() === 'difficulties' ? [] : {});
    },
    send: (channel: string, data: unknown): void => {
      sent.push([channel, data]);
    },
  } as unknown as Transport;

const settle = async (): Promise<void> => {
  for (let index = 0; index < 10; index++) {
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

    // linkedom's `value` is read-only: it follows the selected option.
    Array.from(select.querySelectorAll('option')).forEach((option) =>
      option.toggleAttribute('selected', option.getAttribute('value') === value)
    );
    select.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
    );
  },
  closeAll = () =>
    openDialogs().forEach((dialog) => dialog.removeAttribute('open'));

(async () => {
  await i18next.init({ lng: 'en', defaultNS: 'default', ns: ['default'] });
  await import('../../translations/local/en');

  // The grids there are: the ones the installed tilesets are drawn for.
  const civ1 = validateDescriptor(civ1Json),
    // A hex tileset, as one installed with #94 would say.
    hexStub = validateDescriptor({
      ...JSON.parse(JSON.stringify(civ1Json)),
      id: 'hex-stub',
      name: 'A hex tileset',
      grid: 'hex-odd-r',
    });

  expect(
    "only Civ1's tileset is installed, and it is drawn on square",
    installedTilesets().map(({ id, grid }) => [id, grid]),
    [['civ1', 'square']]
  );
  expect('only square can be drawn for now', supportedTopologies(), ['square']);
  expect(
    "the grids are the installed tilesets' own, that there is a projection for",
    [
      drawableGrids(),
      supportedTopologies(installedTilesets(), drawableGrids()),
    ],
    [['square'], ['square']]
  );
  expect(
    'a hex tileset is not offered before there is a hex projection (#94)',
    [supportedTopologies([civ1, hexStub]), supportedTopologies([hexStub])],
    [['square'], []]
  );

  // Once there is a hex projection.
  const withHex: TopologyId[] = ['square', 'hex-odd-r'];

  expect(
    'a hex tileset adds hex, after square, whichever was installed first',
    [
      supportedTopologies([civ1, hexStub], withHex),
      supportedTopologies([hexStub, civ1], withHex),
    ],
    [
      ['square', 'hex-odd-r'],
      ['square', 'hex-odd-r'],
    ]
  );
  expect(
    'a grid two tilesets are drawn for is offered once, and none gives none',
    [
      supportedTopologies([civ1, civ1], withHex),
      supportedTopologies([], withHex),
    ],
    [['square'], []]
  );
  expect(
    'a hex tileset alone offers only hex',
    supportedTopologies([hexStub], withHex),
    ['hex-odd-r']
  );
  expect(
    'a projection with no tileset drawn for its grid offers nothing',
    supportedTopologies([civ1], ['staggered-iso', 'hex-odd-r']),
    []
  );
  expect(
    'a world that does not say is square, and square is supported',
    [isSupportedTopology(undefined), isSupportedTopology('square')],
    [true, true]
  );
  expect(
    'isometric, hex and an unknown grid are not',
    ['staggered-iso', 'hex-odd-r', 'triangles'].map(isSupportedTopology),
    [false, false, false]
  );

  // The topology a world's grid gives.
  const unsaid = topologyFor({ width: 10, height: 8 }),
    square = topologyFor({ topologyId: 'square', width: 10, height: 8 }),
    hex = topologyFor({ topologyId: 'hex-odd-r', width: 10, height: 8 }),
    iso = topologyFor({ topologyId: 'staggered-iso', width: 10, height: 8 });

  expect(
    'a world that does not say which grid gets a square topology',
    [unsaid instanceof SquareTopology, topologyName(unsaid)],
    [true, 'square']
  );
  expect(
    "a square world's topology is square",
    [square instanceof SquareTopology, square.directions().length],
    [true, 8]
  );
  expect(
    "a 'hex-odd-r' world builds a hex topology, wrapping both ways",
    [
      (hex as unknown) instanceof HexOddRTopology,
      hex.directions().length,
      hex.wrapsX(),
      hex.wrapsY(),
      topologyName(hex),
    ],
    [true, 6, true, true, null]
  );
  expect(
    "a 'staggered-iso' world builds an isometric topology, wrapping both ways",
    [
      (iso as unknown) instanceof StaggeredIsoTopology,
      iso.wrapsX(),
      iso.wrapsY(),
    ],
    [true, true, true]
  );
  expect(
    'an odd height is refused on hex and isometric grids, not on square',
    [
      threw(() =>
        topologyFor({ topologyId: 'hex-odd-r', width: 10, height: 7 })
      ),
      threw(() =>
        topologyFor({ topologyId: 'staggered-iso', width: 10, height: 7 })
      ),
      threw(() => topologyFor({ topologyId: 'square', width: 10, height: 7 })),
    ],
    [true, true, false]
  );
  expect(
    'an unknown grid is refused',
    threw(() => topologyFor({ topologyId: 'triangles', width: 10, height: 8 })),
    true
  );

  // Each grid's sizes.
  expect(
    "square's sizes are New Game's own, unchanged",
    worldSizesFor('square').map(({ key, width, height }) => [
      key,
      width,
      height,
    ]),
    [
      ['tiny', 40, 25],
      ['small', 64, 40],
      ['normal', 80, 50],
      ['large', 104, 65],
      ['huge', 128, 80],
    ]
  );
  expect(
    "square's sizes are the very list New Game has always offered",
    worldSizesFor('square') === worldSizes,
    true
  );
  expect(
    'isometric sizes are half as wide and twice as tall as square',
    worldSizesFor('staggered-iso').map(({ key, width, height }) => [
      key,
      width,
      height,
    ]),
    [
      ['tiny', 20, 50],
      ['small', 32, 80],
      ['normal', 40, 100],
      ['large', 52, 130],
      ['huge', 64, 160],
    ]
  );
  expect(
    'hex sizes',
    worldSizesFor('hex-odd-r').map(({ key, width, height }) => [
      key,
      width,
      height,
    ]),
    [
      ['tiny', 38, 26],
      ['small', 61, 42],
      ['normal', 74, 54],
      ['large', 97, 70],
      ['huge', 119, 86],
    ]
  );

  (['staggered-iso', 'hex-odd-r'] as const).forEach((topologyId) => {
    worldSizesFor(topologyId).forEach((size, index) => {
      const squareSize = worldSizes[index],
        tiles = size.width * size.height,
        squareTiles = squareSize.width * squareSize.height;

      expect(
        `${topologyId} ${size.key}: an even height, within 2% of square's tiles, the same civilizations, and a world the grid can be`,
        [
          size.height % 2,
          Math.abs(tiles - squareTiles) / squareTiles <= 0.02,
          [size.key, size.minPlayers, size.maxPlayers, size.players],
          threw(() => topologyFor({ topologyId, ...size })),
        ],
        [
          0,
          true,
          [
            squareSize.key,
            squareSize.minPlayers,
            squareSize.maxPlayers,
            squareSize.players,
          ],
          false,
        ]
      );
    });
  });

  // Customize World's sizes.
  expect(
    "Customize World's default 80 × 60 is fine on every grid",
    (['square', 'staggered-iso', 'hex-odd-r'] as const).map((topologyId) =>
      customSizeProblem(topologyId, '80', '60')
    ),
    [null, null, null]
  );
  expect(
    'an odd height is fine on square',
    customSizeProblem('square', '40', '25'),
    null
  );
  expect(
    'an odd height is refused on hex and isometric grids, beside the height',
    [
      customSizeProblem('hex-odd-r', '40', '25'),
      customSizeProblem('staggered-iso', '40', '25'),
    ],
    [
      { field: 'height', message: 'CustomizeWorld.even-height' },
      { field: 'height', message: 'CustomizeWorld.even-height' },
    ]
  );
  expect(
    'an empty, zero, negative or fractional size is refused on square, beside the box',
    [
      customSizeProblem('square', '', '50'),
      customSizeProblem('square', '80', '0'),
      customSizeProblem('square', '-80', '50'),
      customSizeProblem('square', '80', '2.5'),
    ],
    [
      { field: 'width', message: 'CustomizeWorld.whole-number' },
      { field: 'height', message: 'CustomizeWorld.whole-number' },
      { field: 'width', message: 'CustomizeWorld.whole-number' },
      { field: 'height', message: 'CustomizeWorld.whole-number' },
    ]
  );

  // The question itself: hidden with one grid.
  const chosen: string[] = [];

  askMapGrid((grid) => chosen.push(grid));

  expect('with one grid, nothing is shown', openDialogs().length, 0);

  await settle();

  expect('and square is chosen for the player', chosen, ['square']);

  // With a hex tileset installed as well, and a projection for it, it is asked, square to start with.
  askMapGrid(
    (grid) => chosen.push(grid),
    supportedTopologies([civ1, hexStub], withHex)
  );

  await settle();

  expect('with two grids, the question is shown', shown(), {
    title: 'Which map grid?',
    options: ['Square', 'Hex'],
  });
  expect(
    'square to start with',
    (latest().querySelector('select') as HTMLSelectElement).value,
    'square'
  );

  choose('hex-odd-r');

  await settle();

  expect('and the player chooses', chosen, ['square', 'hex-odd-r']);

  closeAll();

  // New Game: no grid question, the sizes as always, and the grid sent.
  askNewGame(transport, () => {});

  await settle();

  expect('New Game opens on the world sizes', shown(), {
    title: 'How big a world?',
    options: [
      'Tiny (40 × 25)',
      'Small (64 × 40)',
      'Normal (80 × 50)',
      'Large (104 × 65)',
      'Huge (128 × 80)',
    ],
  });
  expect('and nothing else', openDialogs().length, 1);

  choose('large');

  await settle();

  choose('9');

  await settle();

  expect(
    'New Game sends the square grid with the size and players',
    requests.find(([channel]) => channel === 'setOptions'),
    [
      'setOptions',
      {
        topologyId: 'square',
        width: 104,
        height: 65,
        difficulty: '',
        players: 9,
      },
    ]
  );
  expect('then starts', sent, [['start', null]]);

  closeAll();
  requests.length = 0;
  sent.length = 0;

  // Earth: square only, never asked.
  askEarth(transport, () => {});

  await settle();

  expect('Earth opens on its sizes', shown().options, [
    'Normal (80 × 50)',
    'Large (104 × 65)',
    'Huge (128 × 80)',
  ]);
  expect(
    'Earth sizes are square',
    earthWorldSizes.every((size) => worldSizes.includes(size)),
    true
  );

  choose('normal');

  await settle();

  choose('7');

  await settle();

  expect(
    'Earth sends the square grid',
    requests.find(([channel]) => channel === 'setOptions'),
    [
      'setOptions',
      {
        earth: true,
        topologyId: 'square',
        width: 80,
        height: 50,
        difficulty: '',
        players: 7,
      },
    ]
  );

  closeAll();
  requests.length = 0;
  sent.length = 0;

  // Game setup, opened on Advanced as Customize world does: no grid question, and the grid sent with the rest. (The
  //  grid select is shown only for more than one grid, which the bundled tests cannot stub in: `gameSetupWindow`
  //  covers the square-only case too, and `askMapGrid` the question itself, above.)
  const validity: string[] = [];

  Object.assign((globalThis as any).HTMLInputElement.prototype, {
    setCustomValidity(this: HTMLInputElement, message: string) {
      if (message !== '') {
        validity.push(`${this.getAttribute('name')}: ${message}`);
      }
    },
    reportValidity: () => false,
  });

  const setupTransport = {
      request: (request: Request): Promise<unknown> => {
        const [args] = request.args();

        requests.push([request.channel(), args]);

        switch (request.channel()) {
          case 'civilizations':
            return Promise.resolve([
              { name: 'Babylonian', leaders: ['Hammurabi'] },
              { name: 'Roman', leaders: ['JuliusCaesar'] },
              { name: 'Zulu', leaders: ['Shaka'] },
            ]);
          case 'aiClients':
            return Promise.resolve(['SimpleAIClient']);
          case 'difficulties':
            return Promise.resolve([{ name: 'Prince', level: 2 }]);
          default:
            return Promise.resolve({});
        }
      },
      send: (channel: string, data: unknown): void => {
        sent.push([channel, data]);
      },
    } as unknown as Transport,
    setup = await GameSetupWindow.ask(setupTransport, () => {}, {
      advanced: true,
    }),
    form = setup.element(),
    input = (name: string) =>
      form.querySelector(`input[name="${name}"]`) as HTMLInputElement,
    start = () =>
      (form.querySelector('button.start') as HTMLElement).dispatchEvent(
        new Event('click', { bubbles: true })
      );

  expect(
    'Game setup opens on the form',
    text(form.querySelector('header')).replace(/Close$/, ''),
    'Game setup'
  );
  expect(
    'with no grid select, as there is one grid',
    form.querySelector('select[name=topologyId]'),
    null
  );
  expect('and no map grid question', openDialogs().length, 1);

  // linkedom's `value` follows the attribute.
  input('height').setAttribute('value', '0');
  input('height').dispatchEvent(new Event('input', { bubbles: true }));
  start();

  await settle();

  expect('a height of 0 is refused beside the box', validity, [
    'height: A whole number, 1 or more.',
  ]);
  expect(
    'and nothing is sent',
    requests.filter(([channel]) => channel === 'setOptions'),
    []
  );

  input('height').setAttribute('value', '25');
  input('height').dispatchEvent(new Event('input', { bubbles: true }));
  start();

  await settle();

  const setOptions = requests.find(([channel]) => channel === 'setOptions');

  expect(
    'Game setup sends the square grid with the size',
    (({ topologyId, width, height }: any) => ({ topologyId, width, height }))(
      setOptions?.[1]
    ),
    { topologyId: 'square', width: 80, height: 25 }
  );
  expect('then starts', sent, [['start', null]]);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL supportedTopologies (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS supportedTopologies (${checks} checks)\n`);
  process.exit(0);
})().catch((error) => {
  process.stderr.write(`FAIL supportedTopologies: ${error.stack ?? error}\n`);
  process.exit(1);
});
