import { City as CityData, PlainObject } from '@civ-clone/ui-protocol/types';
import { splitYield, yieldGroup } from '@civ-clone/ui-client/lib/yieldMap';
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
import { h } from '@civ-clone/ui-widgets/lib/html';
import isAnarchy from './government';
import { instance as localeProvider } from '@civ-clone/ui-client/LocaleProvider';
import { s } from '@dom111/element';
import { t } from 'i18next';
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
    [usedPart, freePart, deficitPart] = Array.from(
      bar.children
    ) as HTMLElement[];

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

  return h(s('<div class="city-map"></div>', portalCanvas), {
    click: (event: MouseEvent) => {
      if (readOnly || event.target !== portalCanvas) {
        return;
      }

      // The canvas is scaled by CSS, so `offsetX`/`offsetY` need mapping
      // back onto its own pixels before they can be turned into a tile.
      const localTile = cityPortal.tileAt(
          (event.offsetX * portalCanvas.width) / portalCanvas.offsetWidth,
          (event.offsetY * portalCanvas.height) / portalCanvas.offsetHeight
        ),
        tile = city.tiles.find((tile) => tile.id === localTile?.id);

      if (!tile) {
        return;
      }

      transport.send('action', {
        name: 'ChangeWorkedTile',
        id: city.id,
        tile: tile.id,
      });
    },
  });
};
