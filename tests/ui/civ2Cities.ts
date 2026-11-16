// Civ2's cities in the interface (M2c, #1007), from the data the engine sends, with no rules here:
//
// - an angry citizen is drawn with its own face, the interface's unhappy one where there's no angry face (marked so it
//   reads apart), and said as angry; with Civ2's people imported, a city's citizens are its era's, men and women in
//   turn;
// - the stages of happiness (`citizens.stages`) are a row of faces each, under their names, and a Civ1 city has none;
// - the build list warns of the shields a change would lose (`progressAfterChange`), counts the turns from what would
//   be left, and shows Capitalization's gold per turn (`goldPerTurn`) in place of its cost and turns, in both
//   interfaces; the city screen says the gold of a city building it;
// - a specialist the rules allow no other kind of isn't a button;
// - the city's map reads the city's own figures for its squares (`squareYields`);
// - a city is drawn in its era's style, at that style's sizes, a size larger for a capital;
// - Civ2's Palace escape is a yes or no, worded;
// - Civ2's other Auto modes are offered only under rules with them;
// - each new notice has its words in en and en-GB.

// Must stay first: the components read `document` as they load.
import './lib/dom';
import './lib/interfaces';
import './lib/classicInterface';
import './lib/artPacks';

import { BuildItem, City, CityBuild, Tile } from '@civ-clone/ui-protocol/types';
import {
  chooseFromListBody,
  chooseFromListChoice,
  chooseFromListTitle,
} from '@civ-clone/ui-client/lib/chooseFromList';
import {
  citizenSpriteChoices,
  citizenSummary,
  peopleFaces,
} from '@civ-clone/ui-client/lib/citizens';
import {
  renderHappinessPanel,
  renderHappinessStages,
  renderPopulation,
  stageMoods,
} from '@civ-clone/ui-city/components/lib/cityYields';
import { TilesetDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import CityBuildSelectionWindow from '@civ-clone/ui-interface-classic/components/CityBuildSelectionWindow';
import Transport from '@civ-clone/ui-client/Transport';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import { autoModeChoices } from '@civ-clone/ui-client/components/lib/cityBuild';
import { buildRow } from '@civ-clone/ui-interface-modern/components/CityBuildChoice';
import { changeLoss } from '@civ-clone/ui-client/lib/cityTurns';
import cityMapLayout from '@civ-clone/ui-map/lib/cityMapLayout';
import citySprite from '@civ-clone/ui-assets/lib/citySprite';
import civ2 from '@civ-clone/ui-tileset-civ2/civ2.json';
import addFormatters from '@civ-clone/ui-game/app/i18nFormatters';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import { validateDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';

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

process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL civ2-cities: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

console.error = () => {};

// No IndexedDB under node: the interface's faces are all there but an angry one, which Civ1's art has none of.
const drawn: string[] = [];

(assetStore as any).get = (path: string) =>
  Promise.resolve(
    /people_angry_/.test(path) ? undefined : { name: path, uri: '' }
  );
(assetStore as any).shownAtURL = (path: string) => {
  drawn.push(path);

  return Promise.resolve('data:,');
};

const settle = () => new Promise((resolve) => setTimeout(resolve)),
  text = (element: Element | null): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  player = {
    id: 'Player-1',
    civilization: { _: 'Roman' },
  },
  yieldOf = (_: string, value: number) => ({
    _,
    __: [_, 'Yield'],
    value,
    values: [],
  }),
  city = (fields: { [key: string]: unknown } = {}): City =>
    ({
      id: 'City-1',
      name: 'Rome',
      player,
      originalPlayer: player,
      growth: { size: 6 },
      specialists: [],
      improvements: [],
      yields: [yieldOf('Production', 4)],
      ...fields,
    } as unknown as City);

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  addFormatters(i18next);
  await import('./lib/strings');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-city-improvement/en');
  await import('../../translations/civ2-city-improvement/en');

  // Angry citizens.

  expect(
    "an angry citizen's faces: its own, then the unhappy one",
    citizenSpriteChoices(['unhappy', 'angry'], 'Rome').map((sprites) =>
      sprites.map((sprite) => sprite.replace(/_[fm]$/, ''))
    ),
    [['city/people_unhappy'], ['city/people_angry', 'city/people_unhappy']]
  );
  expect(
    'said as angry, after the unhappy',
    citizenSummary(['happy', 'unhappy', 'angry', 'angry'], []),
    '1 happy, 1 unhappy, 2 angry'
  );
  expect(
    "Civ2's people: men and women in turn, a man first",
    peopleFaces(['happy', 'content', 'angry']),
    ['happy-male', 'content-female', 'angry-male']
  );

  drawn.length = 0;

  const population = renderPopulation(
    city({ citizens: { moods: ['happy', 'unhappy', 'angry'], causes: [] } })
  ) as HTMLElement;

  await settle();

  expect(
    'drawn: the angry citizen with the unhappy face, marked',
    [
      population.querySelectorAll('.citizen').length,
      population.querySelectorAll('.citizen.angry-fallback').length,
      population.getAttribute('aria-label'),
    ],
    [3, 1, '1 happy, 1 unhappy, 1 angry']
  );

  // The stages.

  const stages = [
      { name: 'base', happy: 0, unhappy: 6, angry: 2 },
      { name: 'luxuries', happy: 1, unhappy: 5, angry: 1 },
      { name: 'buildings', happy: 1, unhappy: 3, angry: 0 },
      { name: 'units', happy: 1, unhappy: 1, angry: 0 },
      { name: 'wonders', happy: 2, unhappy: 1, angry: 0 },
    ],
    staged = city({
      citizens: {
        moods: ['happy', 'happy', 'content', 'content', 'content', 'unhappy'],
        causes: [],
        stages,
      },
    });

  expect(
    "a stage's moods: happy, content, unhappy, angry",
    stageMoods(stages[1]!, 6),
    ['happy', 'unhappy', 'unhappy', 'unhappy', 'unhappy', 'angry']
  );

  const rows = renderHappinessStages(staged)!;

  expect(
    'a row for each stage, under its name',
    Array.from(rows.querySelectorAll('.happiness-stage')).map((row) => [
      text(row.querySelector('.happiness-stage-name')),
      row.querySelectorAll('.citizen').length,
    ]),
    [
      ['To begin with', 6],
      ['Luxuries', 6],
      ['Buildings', 6],
      ['Martial law and units', 6],
      ['Wonders', 6],
    ]
  );
  expect(
    "a city without stages (Civ1's) has none, and its screen nothing more",
    [
      renderHappinessStages(
        city({ citizens: { moods: ['happy'], causes: [] } })
      ),
      renderHappinessPanel(city()),
    ],
    [null, '']
  );

  // The build list: the change penalty and Capitalization.

  const cityBuild = {
      id: 'CityBuild-1',
      auto: false,
      city: city(),
      building: { item: { _: 'Warrior' }, cost: { value: 10 } },
      cost: { value: 10 },
      progress: { value: 8 },
      remaining: 2,
      held: [],
    } as unknown as CityBuild,
    item = (
      _: string,
      cost: number,
      fields: { [key: string]: unknown } = {}
    ): BuildItem =>
      ({
        id: `BuildItem-${_}`,
        _: 'BuildItem',
        item: { _ },
        cost: { value: cost },
        group: 'improvement',
        held: [],
        ...fields,
      } as unknown as BuildItem),
    temple = item('Temple', 30, { progressAfterChange: 4 }),
    settlers = item('Settlers', 30, { progressAfterChange: 8, group: 'unit' }),
    capitalization = item('Capitalization', 0, {
      goldPerTurn: 4,
      held: ['civ2-city-improvement:city/hold/capitalization'],
    }),
    templeRow = buildRow(cityBuild, temple),
    capitalizationRow = buildRow(cityBuild, capitalization);

  expect(
    'the shields a change would lose, and none within a category',
    [changeLoss(cityBuild, temple), changeLoss(cityBuild, settlers)],
    [4, 0]
  );
  expect(
    "the new interface: the loss under the item, and its turns from what's left",
    [
      templeRow.meta,
      templeRow.facts?.map(({ label, value }) => [label, value]),
    ],
    [
      'Changing loses 4 shields',
      [
        ['Cost in shields', '30'],
        ['Turns', '7 turns'],
      ],
    ]
  );
  expect(
    'Capitalization: the gold it makes each turn, no cost or turns, and that it never completes',
    [
      capitalizationRow.meta,
      capitalizationRow.facts?.map(({ label, value }) => [label, value]),
    ],
    [null, [['Gold per turn', '4']]]
  );

  const classic = new CityBuildSelectionWindow(
      cityBuild,
      [temple, settlers, capitalization],
      { send: () => {} } as unknown as Transport
    ),
    options = Array.from(classic.element().querySelectorAll('option')).map(
      text
    );

  expect(
    'the classic interface: the loss on the line, and Capitalization by its gold',
    options,
    [
      'Temple (Cost: 30 / 7 turns) – changing loses 4 shields',
      'Settlers (Cost: 30 / 6 turns)',
      'Capitalization (4 gold per turn)',
    ]
  );

  classic.close();

  // Specialists.

  const clickable = (specialistsAvailable?: string[]) =>
    (
      renderPopulation(
        city({
          specialists: [{ _: 'Entertainer' }],
          ...(specialistsAvailable ? { specialistsAvailable } : {}),
        }),
        ['content'],
        () => {}
      ) as HTMLElement
    ).querySelectorAll('.specialist.clickable').length;

  expect(
    'a specialist is a button where it can change, and only there',
    [
      clickable(),
      clickable(['Entertainer', 'Scientist']),
      clickable(['Entertainer']),
    ],
    [1, 1, 0]
  );

  // The city's map, with the city's figures for its squares.

  const square = (x: number, y: number): Tile =>
      ({
        id: `Tile-${x}-${y}`,
        x,
        y,
        yields: [yieldOf('Food', 1)],
        terrain: { _: 'Ocean' },
        units: [],
      } as unknown as Tile),
    centre = square(10, 10),
    sea = square(11, 10),
    mapped = cityMapLayout({
      ...city(),
      tile: centre,
      tiles: [centre, sea],
      tilesWorked: [sea],
      player: {
        ...player,
        world: { width: 40, height: 40, topologyId: 'square', tiles: [] },
      },
      squareYields: [{ x: 11, y: 10, yields: [{ _: 'Food', value: 2 }] }],
    } as unknown as City);

  expect(
    "the city's map: a square at its place in the small world, with what it yields the city",
    mapped.tiles.map(({ yields }) => yields.map(({ _, value }) => [_, value])),
    [[['Food', 1]], [['Food', 2]]]
  );

  // City styles by era.

  const descriptor = validateDescriptor(civ2) as TilesetDescriptor,
    spriteOf = (size: number, style?: unknown, improvements: string[] = []) =>
      citySprite(descriptor, {
        player,
        growth: { size },
        improvements: improvements.map((_) => ({ _ })),
        ...(style ? { style } : {}),
      } as unknown as City);

  expect(
    "ancient: the civilization's style, at 4, 6 and 8; industrial at 5, 8 and 11; modern at 5, 11 and 19",
    [
      [3, 4, 6, 8].map((size) => spriteOf(size)),
      [4, 5, 8, 11].map((size) =>
        spriteOf(size, {
          era: 'industrial',
          people: 'industrial',
          larger: false,
        })
      ),
      [10, 11, 18, 19].map((size) =>
        spriteOf(size, { era: 'modern', people: 'modern', larger: false })
      ),
    ],
    [
      [
        'city/ancient-classical/0',
        'city/ancient-classical/1',
        'city/ancient-classical/2',
        'city/ancient-classical/3',
      ],
      [
        'city/early-industrial/0',
        'city/early-industrial/1',
        'city/early-industrial/2',
        'city/early-industrial/3',
      ],
      ['city/modern/1', 'city/modern/2', 'city/modern/2', 'city/modern/3'],
    ]
  );
  expect(
    'a capital drawn a size larger, but never past the largest, and walled',
    [
      spriteOf(3, { era: 'ancient', people: 'ancient', larger: true }),
      spriteOf(9, { era: 'ancient', people: 'ancient', larger: true }, [
        'CityWalls',
      ]),
    ],
    ['city/ancient-classical/1', 'city/ancient-classical/walled-3']
  );
  expect(
    "Civ2's people: an era's sprite and the small one, listed as optional",
    [
      descriptor.people,
      civ2.assets.optional.includes('people/renaissance/angry-female'),
      civ2.assets.optional.includes('people/small/tax-collector'),
    ],
    [
      { sprite: 'people/{era}/{face}', small: 'people/small/{face}' },
      true,
      true,
    ]
  );

  // The Palace escape.

  expect(
    "the Palace escape's question, and its yes and no",
    [
      chooseFromListTitle('capture-city.palace-escape', {}),
      chooseFromListBody('capture-city.palace-escape', {
        city: { name: 'Antium', originalPlayer: player },
        cost: 1000,
      }),
      chooseFromListChoice('capture-city.palace-escape', true),
      chooseFromListChoice('capture-city.palace-escape', false),
    ],
    [
      'Capital captured',
      'Our capital has been captured! Move the Palace to Antium for 1,000 gold?',
      'Yes, move the Palace',
      'No, let it go',
    ]
  );

  // Auto modes.

  expect(
    'the other Auto modes, under rules with them and off Auto only',
    [
      autoModeChoices({ ...cityBuild, autoMode: null }).map(
        ({ label }) => label
      ),
      autoModeChoices({ ...cityBuild, auto: true, autoMode: 'any' }),
      autoModeChoices(cityBuild),
    ],
    [['Auto: units only', 'Auto: improvements only'], [], []]
  );

  // Every new notice in en and en-GB.

  const notices = [
    'City.celebration-growth',
    'City.nuclear-meltdown',
    'City.partisans',
    'City.partisans-against-us',
    'City.plundered',
    'City.plundered-by-us',
    'Unit.upgraded',
    'Wonder.apollo-revealed',
    'Wonder.apollo-revealed.ours',
    'Wonder.apollo-revealed.unmet',
  ];

  await import('./lib/strings-en-GB');
  await import('../../translations/civ2-city-improvement/en-GB');

  for (const lng of ['en', 'en-GB']) {
    await i18next.changeLanguage(lng);

    expect(
      `every new notice has a title and a body (${lng})`,
      notices.flatMap((key) =>
        ['title', 'body']
          .filter(
            (part) => !i18next.exists(`${key}.${part}`, { ns: 'notification' })
          )
          .map((part) => `${key}.${part}`)
      ),
      []
    );
  }

  expect(
    'British spellings where they differ',
    [
      i18next.t('Wonder.apollo-revealed.unmet.body', {
        ns: 'notification',
        wonder: { _: 'ApolloProgram' },
      }),
      i18next.t('Improvement.Capitalization.name', { ns: 'city' }),
    ],
    [
      'A far away civilisation’s ApolloProgram has revealed the whole world to every civilisation.',
      'Capitalisation',
    ]
  );

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL civ2-cities (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS civ2-cities (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL civ2-cities: ${error?.stack ?? error}\n`);
  process.exit(1);
});
