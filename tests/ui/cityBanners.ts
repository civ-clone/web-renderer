// The cities on the map under the new interface (#747), drawn on a recording canvas: the theme's `--ui-city-banner`
//  choosing the classic label or the banner; your own city's banner with its size, name, the turns to finish what it's
//  building (a dash for nothing) and a food bar, red when it's starving; the disorder and celebration flags; a rival's
//  with its size and name only; the size alone at scale 1; the widest within what an update clears; and a click on a
//  banner finding its city, the one on top where two overlap, which a click on the city's own square doesn't.

// Must stay first: it gives the layer a canvas and a `document` to draw with.
import { fakeCanvas, preloadImage } from './lib/fakeCanvas';
import './lib/grids';

import CityBanners, {
  BannerStyle,
} from '@civ-clone/ui-map/components/Map/CityBanners';
import { Tile } from '@civ-clone/ui-client/types';
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
i18next.init({ lng: 'en', initImmediate: false, resources: {} });

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
    context.stroke = () => calls.push(['stroke']);

    TestCityBanners.form = form;

    const layer = new TestCityBanners(world(cities), scale, 16, canvas);

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
    16,
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

// Too small for words.
const small = draw({ '2,2': ownCity(), '6,6': rivalCity }, { scale: 1 });

expect('at scale 1, each city is its size alone', small.texts, ['3', '7']);

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
