import {
  City as CityData,
  PlainObject,
  PlayerTile,
} from '@civ-clone/ui-protocol/types';
import { TOptions, t } from 'i18next';
import {
  netTileYields,
  splitYield,
  yieldGroup,
} from '@civ-clone/ui-client/lib/yieldMap';
import Cities from '@civ-clone/ui-map/components/Map/Cities';
import Fog from '@civ-clone/ui-map/components/Map/Fog';
import Landscape from '@civ-clone/ui-map/components/Map/Landscape';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import Units from '@civ-clone/ui-map/components/Map/Units';
import Unworkable from '@civ-clone/ui-map/components/Map/Unworkable';
import World from '@civ-clone/ui-map/components/World';
import Yields from '@civ-clone/ui-map/components/Map/Yields';
import cityMapLayout from '@civ-clone/ui-map/lib/cityMapLayout';
import isAnarchy from '@civ-clone/ui-client/lib/government';
import { instance as localeProvider } from '@civ-clone/ui-platform/LocaleProvider';
import { s } from '@dom111/element';
import { tileBounds } from '@civ-clone/ui-map/lib/projection';
import { yieldIcon } from './cityYields';

// The parts of the city screen both its layouts draw (#746): the yields as bars, and the city's map.

// The yield rows the city screen draws, one a group. This is the screen's layout, not a rule: the groups themselves come
//  from the engine's class ancestry.
const yieldRows = [
  'Food',
  'Production',
  'Trade',
  'Luxuries',
  'Gold',
  'Research',
];

// The groups drawn elsewhere on the screen: the rows above, and the citizens, which show Happiness and Unhappiness.
const drawnYieldGroups = [...yieldRows, 'Happiness', 'Unhappiness'];

const yieldName = (group: string): string =>
  t(`${group}.name`, {
    defaultValue: group,
    ns: 'yield',
  });

// A tick every one of a yield, as Civ1 draws an icon each, while they stay apart: every 5 or 10 for a large city.
const yieldTick = (scale: number): number =>
  scale <= 30 ? 1 : scale <= 150 ? 5 : 10;

/**
 * One yield as a row (#719): its icon, a bar of what the city makes, and the figures. The bar's first part is what the
 *  city uses of it (the food eaten, the shields supporting units, the trade lost to corruption, the gold for upkeep),
 *  then what's left over, or, past the end of what it makes, a red part for what it's short. Every row is drawn to
 *  `scale`, so the bars compare. `labelled` shows the yield's name after its icon, as the new layout does (#746).
 */
const renderYieldRow = (
  group: string,
  { used, deficit, free }: { used: number; deficit: number; free: number },
  scale: number,
  summary: string,
  labelled: boolean
): HTMLElement => {
  const row = s(
      `<div class="yield-row" data-yield="${group}"><span class="visually-hidden"></span></div>`
    ),
    percent = (value: number) => `${(value / scale) * 100}%`,
    bar = s(
      `<span class="bar" aria-hidden="true"><span class="used"></span><span class="free"></span><span class="deficit"></span></span>`
    ),
    [usedPart, freePart, deficitPart] = Array.from(bar.children) as [
      HTMLElement,
      HTMLElement,
      HTMLElement
    ];

  usedPart.style.width = percent(used);
  freePart.style.width = percent(free);
  deficitPart.style.width = percent(deficit);
  bar.style.setProperty('--tick', percent(Math.min(yieldTick(scale), scale)));

  // Set as text, not markup: a yield's name can be whatever the engine calls it.
  row.setAttribute('title', summary);
  row.firstElementChild!.textContent = summary;

  const icon = yieldIcon(group);

  icon.setAttribute('aria-hidden', 'true');

  row.append(icon);

  if (labelled) {
    const name = s('<span class="name" aria-hidden="true"></span>');

    name.textContent = yieldName(group);

    row.append(name);
  }

  row.append(
    bar,
    s(
      `<span class="figures" aria-hidden="true">${
        used + deficit > 0
          ? `<span class="total">${localeProvider.number(used + free)}</span>`
          : ''
      }<span class="net${
        deficit > 0 ? ' negative' : ''
      }">${localeProvider.number(
        deficit > 0 ? -deficit : free,
        used + deficit > 0 ? { signDisplay: 'exceptZero' } : {}
      )}</span></span>`
    )
  );

  return row;
};

/** The city's yields as bars, one row a yield, then its pollution, and any yields the screen has no row for. */
export const renderYields = (
  city: CityData,
  { labelled = false }: { labelled?: boolean } = {}
): Node => {
  const rows = yieldRows.map(
      (group) => [group, splitYield(group, city.yields)] as const
    ),
    pollution = Number.isFinite(city.pollution)
      ? Math.max(0, city.pollution!)
      : 0,
    // Wide enough for the most any row makes or uses, so the bars compare, and never nothing.
    scale = Math.max(
      1,
      pollution,
      ...rows.map(([, { used, deficit, free }]) => used + deficit + free)
    );

  return s(
    '<div class="yields-detail"></div>',
    ...rows.map(([group, split]) =>
      renderYieldRow(
        group,
        split,
        scale,
        t('City.Yield.summary', {
          context:
            split.deficit > 0 ? 'short' : split.used > 0 ? undefined : 'made',
          yield: yieldName(group),
          made: split.used + split.free,
          used: split.used + split.deficit,
          spare: split.free,
          short: split.deficit,
        }),
        labelled
      )
    ),
    // How much the city pollutes, from the engine's `pollution` data (#402), below the yields as one more row. Civ1
    //  draws it as smokestacks at the bottom of its info panel.
    ...(pollution > 0
      ? [
          renderYieldRow(
            'Pollution',
            { used: 0, deficit: 0, free: pollution },
            scale,
            t('City.pollution', { count: pollution }),
            labelled
          ),
        ]
      : []),
    ...(isAnarchy(city.player)
      ? [s(`<p class="anarchy">${t('City.anarchy')}</p>`)]
      : []),
    // Other, unknown yields
    ...Object.entries(
      city.yields
        .filter(
          (cityYield) => !drawnYieldGroups.includes(yieldGroup(cityYield))
        )
        .reduce((yieldObject, cityYield) => {
          if (!(cityYield._ in yieldObject)) {
            yieldObject[cityYield._] = 0;
          }

          yieldObject[cityYield._] += cityYield.value;

          return yieldObject;
        }, {} as PlainObject)
    ).map(([key, value]) => {
      const other = s(
        '<div class="other-yield"><span></span><span></span></div>'
      );

      other.firstElementChild!.textContent = yieldName(key);
      other.lastElementChild!.textContent = localeProvider.number(
        Number(value)
      );

      return other;
    })
  );
};

// Set as an attribute, where i18next's HTML escaping would show a name with `&` or `'` in it escaped (#704).
const plain = (key: string, options: TOptions = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

// A square in words, for the button over it: what it is, whether the city works it, and what it yields.
const squareLabel = (tile: PlayerTile, city: CityData): string => {
  const { terrain } = tile,
    square = plain('SquareTooltip.list', {
      items: [
        plain(`${terrain._}.name`, { defaultValue: terrain._, ns: 'world' }),
        ...(terrain.features ?? []).map(({ _ }) =>
          plain(`Feature.${_}.name`, { defaultValue: _, ns: 'world' })
        ),
      ],
    }),
    yields = netTileYields(tile.yields ?? [])
      // Food, Production, Trade, as the map draws them.
      .sort((a, b) => a._.charCodeAt(0) - b._.charCodeAt(0))
      .map(({ _, value }) =>
        plain('CitySquares.yield', {
          name: plain(`${_}.name`, { defaultValue: _, ns: 'yield' }),
          value,
        })
      ),
    state =
      tile.id === city.tile.id
        ? 'city'
        : tile.workedBy !== null && tile.workedBy.id !== city.id
        ? 'taken'
        : city.tilesWorked.some(({ id }) => id === tile.id)
        ? 'worked'
        : 'free';

  return plain(`CitySquares.${state}`, {
    square,
    yields: yields.length
      ? plain('SquareTooltip.list', { items: yields })
      : plain('CitySquares.no-yields'),
  });
};

// The square the keyboard was last on in each city's map, by the city's id: the map is drawn afresh on every update,
//  and Tab should come back to where it left, not to the city's own square each time.
const lastSquare = new Map<string, string>();

// Which way each arrow key goes on the map.
const arrows: { [key: string]: [number, number] } = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/**
 * A button over each of the city's squares (#854), so one can be worked or freed without a pointer: Tab reaches the
 *  map (one stop, on the city's own square to begin with), the arrow keys move from square to square, and Enter or
 *  Space does what a click does. Each says what it is, whether it's worked and what it yields. They are placed over
 *  the canvas by where the portal draws each square, as fractions of the canvas, so they follow it at any size; a
 *  click on a square lands on its button, and does the same.
 */
const renderSquares = (
  city: CityData,
  cityPortal: Portal,
  localTiles: PlayerTile[],
  canvas: HTMLCanvasElement,
  toggle: (tile: PlayerTile) => void
): HTMLElement => {
  const squares = s('<div class="city-squares" role="group"></div>'),
    buttons = new Map<string, HTMLButtonElement>(),
    at = ({ x, y }: { x: number; y: number }): string => `${x},${y}`;

  squares.setAttribute('aria-label', plain('CitySquares.label'));

  localTiles.forEach((localTile) => {
    const tile = city.tiles.find(({ id }) => id === localTile.id);

    if (!tile) {
      return;
    }

    const button = s<HTMLButtonElement>(
        '<button type="button" class="btn-bare city-square"></button>'
      ),
      box = cityPortal.boxOf(localTile),
      percent = (part: number, whole: number): string =>
        `${(part / whole) * 100}%`;

    button.style.left = percent(box.x, canvas.width);
    button.style.top = percent(box.y, canvas.height);
    button.style.width = percent(box.width, canvas.width);
    button.style.height = percent(box.height, canvas.height);
    button.dataset.x = String(localTile.x);
    button.dataset.y = String(localTile.y);
    // Which square it is, for the keyboard to be put back on once the city is drawn again: its label says what the
    //  square is doing, and two squares can read alike.
    button.dataset.focusKey = `square:${at(localTile)}`;
    // One stop for Tab: the city's own square, until another has had the focus.
    button.setAttribute('tabindex', '-1');
    button.dataset.own = String(tile.id === city.tile.id);
    button.setAttribute('aria-label', squareLabel(tile, city));
    button.addEventListener('click', () => toggle(tile));

    buttons.set(at(localTile), button);
    squares.append(button);
  });

  // One stop for Tab: the square the keyboard was last on here, else the city's own, else (a city whose own square
  //  isn't among those the engine sent) the first.
  const all = [...buttons.values()],
    remembered = lastSquare.get(city.id);

  (
    all.find((button) => button.dataset.focusKey === remembered) ??
    all.find((button) => button.dataset.own === 'true') ??
    all[0]
  )?.setAttribute('tabindex', '0');

  // A pointer's press works the square without taking the keyboard there: Enter is still the screen's, and the
  //  arrow keys still the previous and next city, as they were when the press landed on the canvas.
  squares.addEventListener('mousedown', (event) => event.preventDefault());

  // The square the keyboard is on is the one Tab comes back to.
  squares.addEventListener('focusin', (event) => {
    const key = (event.target as HTMLElement).dataset.focusKey;

    if (key === undefined) {
      return;
    }

    lastSquare.set(city.id, key);

    buttons.forEach((button) =>
      button.setAttribute('tabindex', button === event.target ? '0' : '-1')
    );
  });

  squares.addEventListener('keydown', (event) => {
    const step = arrows[event.key],
      from = event.target as HTMLElement;

    // A key held down presses once: each press draws the city again and puts the keyboard back here, so a repeat
    //  would work the square and free it, over and over.
    if (event.repeat && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();

      return;
    }

    // With Shift too: left to the screen, it would be the next city.
    if (
      step === undefined ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      from.dataset.x === undefined
    ) {
      return;
    }

    // The map's own, here: not the previous or next city, nor a scroll of the window.
    event.preventDefault();
    event.stopPropagation();

    // The next of the city's squares that way, over any that aren't its own.
    let x = Number(from.dataset.x) + step[0],
      y = Number(from.dataset.y) + step[1];

    for (let steps = 0; steps < buttons.size; steps++) {
      const next = buttons.get(at({ x, y }));

      if (next) {
        next.focus();

        return;
      }

      x += step[0];
      y += step[1];
    }
  });

  return squares;
};

/** The city's squares, the worked ones with their yields, a click on one working it or not (#9). */
export const renderMap = (
  portal: Portal,
  city: CityData,
  transport: Transport,
  readOnly: boolean
): Node => {
  // Remap the city's tiles into a small local coordinate space so each layer
  // canvas is sized to the city's squares rather than the full world (a full
  // `World` here allocated ~10 world-sized canvases per open/update).
  const {
      center,
      context,
      height: localHeight,
      tiles: localTiles,
      tilesWorked: localTilesWorked,
      width: localWidth,
    } = cityMapLayout(city),
    portalCanvas = s<HTMLCanvasElement>('<canvas></canvas>'),
    cityPortal = new Portal(
      new World(
        {
          ...city.player.world,
          width: localWidth,
          height: localHeight,
          tiles: localTiles,
        },
        // The squares round the city's, as their neighbours only: they aren't drawn (#685).
        context
      ),
      transport,
      portalCanvas,
      {
        playerId: city.player.id,
        scale: portal.scale(),
        tileSize: portal.tileSize() / portal.scale(),
      },
      Landscape,
      Fog,
      Cities,
      Units,
      Yields,
      Unworkable
    );

  // The canvas shows the city's squares, so it is as big as they are in
  // pixels.
  const { width, height } = tileBounds(cityPortal.projection(), [
    center,
    ...localTiles,
  ]);

  portalCanvas.height = height;
  portalCanvas.width = width;

  cityPortal.setCenter(center.x, center.y);
  cityPortal.build(localTiles);

  const unitMap = cityPortal.getLayer(Units)!;
  unitMap.render(
    localTiles.filter((tile) =>
      tile.units.some((unit) => unit.player.id !== city.player.id)
    )
  );

  const yieldMap = cityPortal.getLayer(Yields)!;
  yieldMap.render(localTilesWorked);

  const unworkable = cityPortal.getLayer(Unworkable)!;
  unworkable.setCity(city);
  unworkable.render(localTiles);

  cityPortal.render();

  const toggle = (tile: PlayerTile): void =>
    transport.send('action', {
      name: 'ChangeWorkedTile',
      id: city.id,
      tile: tile.id,
    });

  // A click on a square lands on its button (#854), which does what the click on the canvas used to.
  return s(
    '<div class="city-map"></div>',
    // The canvas and the buttons over it, in one box the size of the canvas.
    s(
      '<div class="city-map-frame"></div>',
      portalCanvas,
      readOnly
        ? ''
        : renderSquares(city, cityPortal, localTiles, portalCanvas, toggle)
    )
  );
};
