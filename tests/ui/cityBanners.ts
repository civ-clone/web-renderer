// The cities on the map under the new interface (#747), drawn on a recording canvas: the theme's `--ui-city-banner`
//  choosing the classic label or the banner; your own city's banner with its size, name, the turns to finish what it's
//  building (a dash for nothing, the hold glyph for a build a rule holds once paid for, #970) and a food bar, red when
//  it's starving; the disorder and celebration flags; a rival's with its size and name only; the size and name alone at
//  scale 1; the widest within what an update clears; and a click on a banner finding its city, the one on top where two
//  overlap, which a click on the city's own square doesn't.

// Must stay first: it gives the layer a canvas and a `document` to draw with.
import { fakeCanvas, preloadImage } from './lib/fakeCanvas';
import './lib/grids';
import './lib/artPacks';

import CityBanners, {
  BannerStyle,
} from '@civ-clone/ui-interface-modern/components/CityBanners';
import { Tile } from '@civ-clone/ui-protocol/types';
import World from '@civ-clone/ui-map/components/World';
import i18next from 'i18next';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL cityBanners: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

// A city's name is looked up in the translations, which fall back to the name itself.
i18next.init({ lng: 'en', initAsync: false, resources: {} });

const style = (form: string): BannerStyle => ({
  form,
  background: 'slate',
  foreground: 'parchment',
  edge: 'brass',
  radius: 2,
  family: 'sans-serif',
  weight: '600',
  food: 'food',
  short: 'short',
  track: 'track',
  light: '#ffffff',
  shade: '#000000',
});

// Drawn with the tokens the test gives it rather than the page's.
class TestCityBanners extends CityBanners {
  static form = 'full';

  protected bannerStyle(): BannerStyle {
    return style(TestCityBanners.form);
  }

  // How far past its square a tile's drawing can go, which updates clear and culling keeps.
  extent(): { overhang: number; bottom: number } {
    return { overhang: this.overhang(), bottom: this.reach().bottom };
  }
}

const happy = preloadImage('city/people_happy_m', 8, 16),
  unhappy = preloadImage('city/people_unhappy_m', 8, 16),
  production = preloadImage('city/production', 8, 8),
  player = (colours: string[]) => ({
    civilization: {
      _: 'Babylonian',
      attributes: [{ name: 'colors', value: colours }],
    },
  }),
  ours = player(['#fff', '#000']),
  theirs = player(['#ff0', '#000']),
  // Your own city, seen in full: building something 20 shields off at 4 a turn, growing at 2 food a turn.
  ownCity = (extra: object = {}) => ({
    name: 'Babylon',
    originalPlayer: ours,
    player: ours,
    civilDisorderDeclared: false,
    celebrateLeader: false,
    growth: { size: 3, progress: { value: 10 }, cost: { value: 40 } },
    build: {
      building: { item: { _: 'Warriors' } },
      progress: { value: 0 },
      cost: { value: 20 },
    },
    yields: [
      { _: 'Production', __: ['Production', 'Yield'], value: 4 },
      { _: 'Food', __: ['Food', 'Yield'], value: 2 },
    ],
    ...extra,
  }),
  // A rival's, as the map is sent it: its size and name, no more.
  rivalCity = {
    name: 'Ur',
    originalPlayer: theirs,
    player: theirs,
    civilDisorderDeclared: false,
    growth: { size: 7 },
  },
  // Wider than the canvas and the banners' reach, so the map wrapping draws no city twice.
  size = 30,
  world = (cities: { [at: string]: object }) => {
    const tiles: Tile[] = [];

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        tiles.push({
          x,
          y,
          yields: [],
          units: [],
          improvements: [],
          city: cities[`${x},${y}`] ?? null,
        } as any);
      }
    }

    return new World({ width: size, height: size, tiles } as any);
  },
  draw = (
    cities: { [at: string]: object },
    { form = 'full', scale = 2 }: { form?: string; scale?: number } = {}
  ) => {
    const { calls, canvas } = fakeCanvas(320, 320),
      context = canvas.getContext('2d') as any,
      fills: [string, number, number, number, number][] = [],
      record = context.fillRect;

    // The colour each rectangle is filled with, as well as where.
    context.fillRect = (...rect: [number, number, number, number]) => {
      fills.push([context.fillStyle, ...rect]);
      record(...rect);
    };
    context.roundRect = (...args: any[]) => calls.push(['roundRect', ...args]);
    context.fill = () => calls.push(['fill']);
    context.stroke = () => calls.push(['stroke', context.strokeStyle]);
    // The hold glyph's strokes (#970).
    ['translate', 'scale', 'arc', 'moveTo', 'lineTo'].forEach((name) => {
      context[name] = (...args: any[]) => calls.push([name, ...args]);
    });

    TestCityBanners.form = form;

    const layer = new TestCityBanners(
      world(cities),
      scale,
      { width: 16, height: 16 },
      canvas
    );

    layer.setViewport(0, 0, 320, 320);
    calls.length = 0;
    fills.length = 0;
    layer.render();

    return {
      layer,
      texts: calls
        .filter(([name]) => name === 'fillText')
        .map(([, text]) => text),
      images: calls
        .filter(([name]) => name === 'drawImage')
        .map(([, image]) =>
          image === production
            ? 'production'
            : image === happy
            ? 'happy'
            : image === unhappy
            ? 'unhappy'
            : 'other'
        ),
      // Where the Production icon and the turns after it are drawn, for where the hold glyph goes in their place.
      productionX: calls.find(
        ([name, image]) => name === 'drawImage' && image === production
      )?.[2] as number | undefined,
      turnsX: calls.filter(([name]) => name === 'fillText')[2]?.[2] as
        | number
        | undefined,
      // Where the hold glyph is drawn (#970): its square's corner and its stroke's colour.
      holds: calls.flatMap(([name], index) =>
        name === 'arc'
          ? [
              [
                calls[index - 3]?.[0] === 'translate'
                  ? calls[index - 3]!.slice(1)
                  : null,
                calls.slice(index).find(([later]) => later === 'stroke')?.[1] ??
                  null,
              ],
            ]
          : []
      ),
      pills: calls
        .filter(([name]) => name === 'roundRect')
        .map(([, x, y, width, height]) => ({ x, y, width, height })),
      fills,
    };
  };

// The size is written in the civilization's second colour where it reads on its first, otherwise in the theme's light or
//  dark ink, whichever reads better (#747): Ethiopia's yellow on lilac is 2.9:1.
const sizeInk = (colours: string[]) => {
  const { calls, canvas } = fakeCanvas(320, 320),
    context = canvas.getContext('2d') as any,
    inks: string[] = [],
    record = context.fillText;

  context.fillText = (...args: any[]) => {
    inks.push(context.fillStyle);
    record(...args);
  };
  context.roundRect = () => {};
  context.fill = () => {};
  context.stroke = () => {};
  TestCityBanners.form = 'full';

  const layer = new TestCityBanners(
    world({
      '2,2': {
        ...rivalCity,
        player: player(colours),
        originalPlayer: player(colours),
      },
    }),
    2,
    { width: 16, height: 16 },
    canvas
  );

  layer.setViewport(0, 0, 320, 320);
  calls.length = 0;
  layer.render();

  return inks[0];
};

expect(
  "a second colour that reads is kept, and one that doesn't gives way",
  [
    sizeInk(['#8E2420', '#F5C342']),
    sizeInk(['#8E6CD8', '#FCDD09']),
    sizeInk(['#7A7A7A', '#D50000']),
    sizeInk(['#1A1A80', '#3A1A1A']),
  ],
  ['#F5C342', '#000000', '#000000', '#ffffff']
);

// The classic label, as the Civ1-classic theme asks for.
const label = draw({ '2,2': ownCity() }, { form: 'label' });

expect(
  'a theme that asks for the label gets the classic one: size and name, each with its shadow',
  label.texts,
  ['3', 'Babylon', '3', 'Babylon']
);
expect('and no banner', label.pills, []);

// Your own city's banner.
const own = draw({ '2,2': ownCity() });

expect(
  'your city: its size, its name and the turns to finish what it builds',
  own.texts,
  ['3', 'Babylon', '5']
);
expect('on a pill with the size in a badge over its end', own.pills.length, 2);
expect('with the Production icon by the turns', own.images, ['production']);
expect(
  'and a food bar along the bottom, a quarter full',
  own.fills.map(([style, , , width]) => [style, width]),
  [
    ['track', own.pills[0].width + 1],
    ['food', Math.round((own.pills[0].width + 1) / 4)],
  ]
);

const nothing = draw({
  '2,2': ownCity({
    build: { building: null, progress: { value: 0 }, cost: { value: 0 } },
  }),
});

expect('building nothing: a dash for the turns', nothing.texts, [
  '3',
  'Babylon',
  '–',
]);

// A build a rule holds once paid for (#959): the hold glyph in place of the turns (#970), which the banner's tooltip
//  words, on a banner as wide as an icon there makes it.
const waiting = draw({
  '2,2': ownCity({
    build: {
      building: { item: { _: 'Settlers' } },
      progress: { value: 42 },
      cost: { value: 40 },
      remaining: -2,
      held: ['civ1-enhanced:city/hold/settlers-until-size-two'],
    },
  }),
});

expect(
  "waiting now: no number of turns, but the hold glyph after the Production icon, in the banner's ink",
  [waiting.texts, waiting.images, waiting.holds.length, waiting.holds[0]?.[1]],
  [['3', 'Babylon'], ['production'], 1, 'parchment']
);
expect(
  'where the turns were: as far after the Production icon as the turns are',
  [
    (waiting.holds[0]?.[0]?.[0] as number) - waiting.productionX!,
    own.turnsX! - own.productionX!,
  ].reduce((a, b) => a - b),
  0
);
expect(
  'a build that will wait, still being paid for, keeps its turns',
  draw({
    '2,2': ownCity({
      build: {
        building: { item: { _: 'Settlers' } },
        progress: { value: 0 },
        cost: { value: 20 },
        remaining: 20,
        held: ['civ1-enhanced:city/hold/settlers-until-size-two'],
      },
    }),
  }).texts,
  ['3', 'Babylon', '5']
);

const starving = draw({
  '2,2': ownCity({
    yields: [
      { _: 'Production', __: ['Production', 'Yield'], value: 4 },
      { _: 'Food', __: ['Food', 'Yield'], value: -1 },
    ],
  }),
});

expect(
  'starving: the food bar is the shortfall colour',
  starving.fills.map(([style]) => style),
  ['track', 'short']
);

const emptyStarving = draw({
  '2,2': ownCity({
    growth: { size: 3, progress: { value: 0 }, cost: { value: 40 } },
    yields: [
      { _: 'Production', __: ['Production', 'Yield'], value: 4 },
      { _: 'Food', __: ['Food', 'Yield'], value: -1 },
    ],
  }),
});

expect(
  'starving with nothing stored: still a sliver of red',
  emptyStarving.fills.map(([style, , , width]) => [style, width]).pop(),
  ['short', 4]
);

const flagged = draw({
  '2,2': ownCity({ civilDisorderDeclared: true, celebrateLeader: true }),
});

expect(
  'in disorder, and celebrating: both flags, after the turns',
  flagged.images,
  ['production', 'unhappy', 'happy']
);
expect('in disorder the banner still says the size', flagged.texts[0], '3');

// A rival's.
const rival = draw({ '6,6': rivalCity });

expect(
  "a rival's city: its size and name, nothing it hasn't been sent",
  [rival.texts, rival.images, rival.fills],
  [['7', 'Ur'], [], []]
);

// A rival's city in disorder is sent so (#265), as v474.05 shows any city's on the map: its banner shows it too.
const rioting = draw({ '6,6': { ...rivalCity, civilDisorderDeclared: true } });

expect(
  "a rival's city in disorder, which it is sent, shows the face",
  rioting.images,
  ['unhappy']
);

// Zoomed out, the size and the name are kept, and nothing else (#822).
const small = draw({ '2,2': ownCity(), '6,6': rivalCity }, { scale: 1 });

expect('at scale 1, each city is its size and name alone', small.texts, [
  '3',
  'Babylon',
  '7',
  'Ur',
]);
expect('with no production, flags or food bar', small.images, []);

// Clicking.
const both = draw({ '2,2': ownCity(), '6,6': rivalCity }),
  [ownPill, , rivalPill] = both.pills,
  centre = ({ x, y, width, height }: any): [number, number] => [
    x + width / 2,
    y + height / 2,
  ],
  nameAt = (x: number, y: number) => both.layer.cityAt(x, y)?.name ?? null;

expect(
  "a click on a banner is for its city, your own or a rival's",
  [nameAt(...centre(ownPill)), nameAt(...centre(rivalPill))],
  ['Babylon', 'Ur']
);
expect(
  "a click on the city's own square isn't the banner's: the square still selects its units",
  nameAt(2 * 32 + 16, 2 * 32 + 16),
  null
);
expect(
  'nor is a click beside the banner',
  nameAt(ownPill.x - 2, ownPill.y + 2),
  null
);

both.layer.setVisible(false);

expect(
  'nor one on a banner hidden with the units (t)',
  nameAt(...centre(ownPill)),
  null
);

// Two cities a few squares apart in a row: their banners overlap, and the one drawn on top, the one further right, takes
//  the click.
const row = draw({
    '2,2': ownCity(),
    '5,2': ownCity({ name: 'Kish' }),
  }),
  [leftPill, , rightPill] = row.pills;

expect(
  'banners close enough to overlap',
  leftPill.x + leftPill.width > rightPill.x,
  true
);
expect(
  'where they overlap, the click is for the banner drawn on top',
  row.layer.cityAt(rightPill.x + 2, rightPill.y + rightPill.height / 2)?.name,
  'Kish'
);

// The widest name in the city lists, with both flags and what it's building: within what an update clears.
const widest = draw({
    '6,6': ownCity({
      name: 'Augusta Praetoria Salassorum',
      civilDisorderDeclared: true,
      celebrateLeader: true,
    }),
  }),
  [widestPill] = widest.pills,
  { overhang, bottom } = widest.layer.extent(),
  [food] = widest.fills;

expect(
  'the widest banner is drawn within the reach an update clears',
  [
    widestPill.x >= 6 * 32 - overhang,
    widestPill.x + widestPill.width <= 7 * 32 + overhang,
    food[2] + food[4] <= 7 * 32 + bottom,
  ],
  [true, true, true]
);

const labelled = draw({ '2,2': ownCity() }, { form: 'label' });

expect(
  "the classic label isn't clicked: the square is, as before",
  labelled.layer.cityAt(2 * 32 + 16, 3 * 32 + 8),
  null
);

// A banner on its own, for the 3D map to place (docs/3d-renderer.md §7.5): the canvas sized to it, the banner drawn as
//  on its square but at the canvas's corner, and how far across it its square's middle is. The classic label isn't.
const alone = (city: object, form = 'full', density?: number) => {
  const { calls, canvas } = fakeCanvas(320, 320),
    context = canvas.getContext('2d') as any;

  context.roundRect = (...args: any[]) => calls.push(['roundRect', ...args]);
  context.fill = () => {};
  context.stroke = () => {};
  context.setTransform = (...args: any[]) =>
    calls.push(['setTransform', ...args]);
  TestCityBanners.form = form;

  const placed = world({ '2,2': city }),
    layer = new TestCityBanners(placed, 2, { width: 16, height: 16 }, canvas);

  calls.length = 0;

  const painted = layer.paintBanner(placed.get(2, 2), density);

  return {
    painted,
    canvas: [canvas.width, canvas.height],
    // How many of the canvas's pixels it drew each of the map's with, as it began and as it finished.
    transforms: calls
      .filter(([name]) => name === 'setTransform')
      .map(([, scale]) => scale),
    texts: calls
      .filter(([name]) => name === 'fillText')
      .map(([, text]) => text),
    pills: calls
      .filter(([name]) => name === 'roundRect')
      .map(([, x, y, width, height]) => ({ x, y, width, height })),
  };
};

const ownAlone = alone(ownCity()),
  [ownPill2D] = own.pills;

expect(
  'your own banner alone: the canvas just big enough for it and its food bar, the pill at its corner',
  [ownAlone.canvas, ownAlone.pills[0]],
  [
    [ownPill2D.width + 1, ownPill2D.height + 1 + 2],
    { x: 0.5, y: 0.5, width: ownPill2D.width, height: ownPill2D.height },
  ]
);
expect(
  'as it says, and saying as much as on the map, with its square’s middle as far across it as on the map',
  [ownAlone.painted, ownAlone.texts],
  [
    {
      width: ownPill2D.width + 1,
      height: ownPill2D.height + 3,
      centre: 2 * 32 + 16 - (ownPill2D.x - 0.5),
    },
    own.texts,
  ]
);

const doubled = alone(ownCity(), 'full', 2);

expect(
  'painted with twice the pixels: a canvas twice the size, drawn at twice the scale and put back after, saying the same, with its square’s middle twice as far across',
  [
    doubled.canvas,
    doubled.transforms,
    doubled.texts,
    doubled.pills[0],
    doubled.painted?.centre,
  ],
  [
    ownAlone.canvas.map((size) => size * 2),
    [2, 1],
    ownAlone.texts,
    ownAlone.pills[0],
    ownAlone.painted!.centre * 2,
  ]
);

const rivalAlone = alone(rivalCity);

expect(
  "a rival's alone: its size and name, with no food bar under it",
  [rivalAlone.texts, rivalAlone.canvas[1], rivalAlone.pills[0]?.height],
  [
    ['7', 'Ur'],
    (rivalAlone.pills[0]?.height ?? 0) + 1,
    rivalAlone.canvas[1]! - 1,
  ]
);
expect(
  "the classic label isn't painted alone, and the canvas is left as it was",
  [alone(ownCity(), 'label').painted, alone(ownCity(), 'label').canvas],
  [null, [320, 320]]
);

// What a banner says, to tell when it's to be painted again (`bannerKey`), on cities shaped as the page has them, every
//  part with an id of its own: the same for the same banner; changed by everything the banner shows, and by nothing it
//  doesn't. None for the classic label.
{
  const keyOf = (city: object, form = 'full') => {
      TestCityBanners.form = form;

      const placed = world({ '2,2': city });

      return new TestCityBanners(
        placed,
        2,
        { width: 16, height: 16 },
        fakeCanvas(320, 320).canvas
      ).bannerKey(placed.get(2, 2));
    },
    // As the page has a city: its growth, what it builds and what it yields, each with an id, as every engine object.
    shaped = (extra: object = {}) => {
      const city = ownCity(extra) as { [key: string]: any };

      return {
        ...city,
        id: 'City-1',
        growth: {
          ...city.growth,
          id: 'CityGrowth-1',
          ...(city.growth.progress
            ? { progress: { ...city.growth.progress, id: 'Progress-1' } }
            : {}),
          ...(city.growth.cost
            ? { cost: { ...city.growth.cost, id: 'Cost-1' } }
            : {}),
        },
        build: city.build && {
          ...city.build,
          id: 'CityBuild-1',
          building: city.build.building && {
            ...city.build.building,
            id: 'BuildItem-1',
          },
          progress: { ...city.build.progress, id: 'Progress-2' },
          cost: { ...city.build.cost, id: 'Cost-2' },
        },
        yields: city.yields.map((each: object, index: number) => ({
          ...each,
          id: `Yield-${index}`,
        })),
      };
    },
    base = keyOf(shaped()),
    changes = (extra: object) => keyOf(shaped(extra)) !== base,
    building = (item: string, progress: number, cost = 20) => ({
      building: { item: { _: item } },
      progress: { value: progress },
      cost: { value: cost },
    });

  expect(
    'the same banner, the same key',
    [base !== null, keyOf(shaped()) === base],
    [true, true]
  );
  expect(
    'changed by all the banner shows: its size, its name, the turns to finish what it builds, building nothing, a build held, how far it is to its next size, starving, disorder, celebration, and who holds it',
    [
      changes({
        growth: { size: 4, progress: { value: 10 }, cost: { value: 40 } },
      }),
      changes({ name: 'Kish' }),
      changes({ build: building('Warriors', 12) }),
      changes({ build: { ...building('Warriors', 0), building: null } }),
      changes({
        build: {
          ...building('Settlers', 42, 40),
          remaining: -2,
          held: ['civ1-enhanced:city/hold/settlers-until-size-two'],
        },
      }),
      changes({
        growth: { size: 3, progress: { value: 30 }, cost: { value: 40 } },
      }),
      changes({
        yields: [
          { _: 'Production', __: ['Production', 'Yield'], value: 4 },
          { _: 'Food', __: ['Food', 'Yield'], value: -1 },
        ],
      }),
      changes({ civilDisorderDeclared: true }),
      changes({ celebrateLeader: true }),
      changes({ player: theirs }),
    ],
    Array(10).fill(true)
  );
  expect(
    'not changed by what it doesn’t show: another item built at the same cost, as far along',
    changes({ build: building('Phalanx', 0) }),
    false
  );
  expect('none for the classic label', keyOf(shaped(), 'label'), null);
}

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL cityBanners (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS cityBanners (${checks} checks)\n`);
