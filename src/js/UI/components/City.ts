import {
  City as CityData,
  CityImprovement,
  CityImprovementMaintenanceGold,
  PlainObject,
  Player,
  Specialist,
  SpendCost,
  Unit as UnitData,
  Yield,
} from '../types';
import { emit, s } from '@dom111/element';
import {
  getAutoLabel,
  getLabelForBuildable,
  getLabelForBuildableEntity,
  toggleAuto,
} from './lib/cityBuild';
import { reduceKnownYield, splitYield, yieldGroup } from '../lib/yieldMap';
import cityMapLayout from '../lib/cityMapLayout';
import { tileBounds } from '../lib/projection';
import {
  renderFigures,
  renderPopulation,
  turnsLeft,
  yieldIcon,
  yieldImages,
} from './lib/cityYields';
import Cities from './Map/Cities';
import CityBuildAvailable from '../../Engine/Requests/CityBuildAvailable';
import CityBuildSelectionWindow from './CityBuildSelectionWindow';
import CityNameWindow from './CityNameWindow';
import ConfirmationWindow from './ConfirmationWindow';
import Fog from './Map/Fog';
import Landscape from './Map/Landscape';
import Portal from './Portal';
import SupportedUnit from './SupportedUnit';
import Transport from '../Transport';
import Unit from './Unit';
import UnitSelectionWindow from './UnitSelectionWindow';
import Units from './Map/Units';
import Unworkable from './Map/Unworkable';
import Window from './Window';
import World from './World';
import Yields from './Map/Yields';
import { cityName } from './lib/city';
import { escape } from './lib/requirements';
import { h } from '../lib/html';
import { instance as localeProvider } from '../LocaleProvider';
import instanceOf from '../lib/instanceOf';
import isAnarchy from './lib/government';
import progressBar from './lib/ProgressBar';
import { specialistForKey } from '../lib/specialists';
import { t } from 'i18next';
import watchCity from './lib/watchCity';
import { unlessRequestFailed } from '../lib/unlessRequestFailed';

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
 *  `scale`, so the bars compare.
 */
const renderYieldRow = (
  group: string,
  { used, deficit, free }: { used: number; deficit: number; free: number },
  scale: number,
  summary: string
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

  row.append(
    icon,
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

const renderYields = (city: CityData): Node => {
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
          })
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
              t('City.pollution', { count: pollution })
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
  },
  renderMap = (
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
  },
  renderBuild = (
    city: CityData,
    chooseProduction: () => void,
    completeProduction: (spendCost: SpendCost) => void,
    readOnly: boolean,
    toggleAutoProduction: () => void
  ): HTMLElement =>
    s(
      `<div class="build"></div>`,
      s(
        `<header></header>`,
        city.build.building && instanceOf(city.build.building.item, 'Unit')
          ? new Unit({
              ...city.build.building.item,
              player: city.player,
              improvements: [],
              busy: null,
            })
          : (t('City.Build.title', {
              item: getLabelForBuildable(city.build.building),
            }) as string),
        city.build.auto
          ? s(`<span class="auto">${t('City.Build.auto-marker')}</span>`)
          : ''
      ),
      ...renderBuildProgress(city),
      readOnly
        ? ''
        : s(
            '<div class="build-actions"></div>',
            h(
              s(
                `<button class="btn-secondary">${t(
                  city.build.building
                    ? 'City.Build.change'
                    : 'City.Build.choose'
                )}</button>`
              ),
              {
                click() {
                  chooseProduction();
                },
              }
            ),
            h(
              s(
                `<button class="btn-secondary auto">${getAutoLabel(
                  city.build
                )}</button>`
              ),
              {
                click() {
                  toggleAutoProduction();
                },
              }
            ),
            ...city.build.spendCost.map((spendCost) =>
              h(
                s(
                  `<button class="btn-secondary buy" data-resource="${
                    spendCost.resource._
                  }">${t('City.Build.buy-with', {
                    spendCost,
                  })}</button>`
                ),
                {
                  click() {
                    completeProduction(spendCost);
                  },
                }
              )
            )
          )
    ),
  // The shields built up towards the item (#687). With no item chosen they are still there, kept for whatever is chosen
  //  next, so they are said on their own.
  renderBuildProgress = (city: CityData): Node[] => {
    const progress = city.build.progress.value;

    if (city.build.building) {
      const perTurn = reduceKnownYield(city.yields, 'Production');

      return [
        progressBar({
          group: 'Production',
          stored: progress,
          capacity: city.build.cost.value,
          perTurn,
        }),
        renderFigures(
          'Production',
          city.build,
          perTurn,
          turnsLeft(city.build, city.yields, 'Production')
        ),
      ];
    }

    if (progress <= 0) {
      return [];
    }

    return [
      s(
        `<p class="figures">${t('City.Build.stored', { count: progress })}</p>`
      ),
    ];
  },
  // The food stored towards the next size (#686).
  renderGrowth = (city: CityData): Node => {
    const perTurn = reduceKnownYield(city.yields, 'Food');

    return s(
      `<div class="growth"><header><span>${t(
        'City.Growth.title'
      )}</span><span class="size">${t('City.Growth.size', {
        size: localeProvider.number(city.growth.size),
      })}</span></header></div>`,
      progressBar({
        group: 'Food',
        stored: city.growth.progress.value,
        capacity: city.growth.cost.value,
        perTurn,
      }),
      renderFigures(
        'Food',
        city.growth,
        perTurn,
        turnsLeft(city.growth, city.yields, 'Food')
      )
    );
  },
  renderImprovements = (
    city: CityData,
    sellImprovement: (
      improvement: CityImprovement,
      saleValue: SpendCost
    ) => void,
    readOnly: boolean
  ): Node => {
    return s(
      `<div class="improvements"></div>`,
      s(
        `<div></div>`,
        ...city.improvements.map((improvement) => {
          const [saleValue] = readOnly
            ? []
            : (improvement.saleValue ?? []).filter(
                (saleValue) => saleValue.resource._ === 'Gold'
              );

          return s(
            '<div class="improvement"></div>',
            s(
              '<span class="name"></span>',
              s(`<span>${getLabelForBuildableEntity(improvement)}</span>`),
              ...city.yields
                .filter(
                  (
                    cityYield: Yield | CityImprovementMaintenanceGold
                  ): cityYield is CityImprovementMaintenanceGold =>
                    cityYield._ === 'CityImprovementMaintenanceGold' &&
                    cityYield.cityImprovement.id === improvement.id
                )
                .flatMap((cityYield) => yieldImages(cityYield, true))
            ),
            // Selling it (#31), from a button of its own (#684). The confirmation says what it fetches.
            saleValue
              ? h(
                  s(
                    `<button class="btn-danger sell">${t(
                      'City.SellImprovement.sell'
                    )}</button>`
                  ),
                  {
                    click() {
                      sellImprovement(improvement, saleValue);
                    },
                  }
                )
              : ''
          );
        })
      )
    );
  },
  renderGarrisonedUnits = (
    city: CityData,
    portal: Portal,
    transport: Transport,
    readOnly: boolean
  ): Node => {
    return h(
      s(
        `<div class="garrisoned-units"><header>${t(
          'City.GarrisonedUnits.title'
        )}</header></div>`,
        s(
          '<div class="units"></div>',
          ...city.tile.units.map((unit) => new Unit(unit).element())
        )
      ),
      {
        click() {
          const cityPlayerUnits = city.tile.units.filter(
            (unit: UnitData) => unit.player.id === city.player.id
          );

          if (readOnly || cityPlayerUnits.length === 0) {
            return;
          }

          // The unit chosen is made the active one, as it is from the map (#482).
          new UnitSelectionWindow(cityPlayerUnits, transport, (unit) =>
            portal.emit('activate-unit', unit)
          );
        },
      }
    );
  },
  // The routes this city holds, and what each adds to its trade (#57).
  renderTradeRoutes = (city: CityData): Node | string =>
    city.tradeRoutes?.length
      ? s(
          `<div class="trade-routes"><header>${t(
            'City.trade-routes'
          )}</header></div>`,
          ...city.tradeRoutes.map((route) => {
            // Already escaped by `Generic.city-name`, so not again (as `TopCitiesReport` does).
            const name = t('Generic.city-name', {
              civilization: route.civilization,
              name: route.name,
            });

            // One Trade icon a point, as the city's own yields are drawn (#683), with the words for a screen reader.
            return s(
              `<p class="trade-route"><span class="visually-hidden">${t(
                'City.trade-route',
                {
                  city: name,
                  trade: route.trade,
                  interpolation: { escapeValue: false },
                }
              )}</span><span class="name" aria-hidden="true">${name}</span></p>`,
              ...yieldImages({ _: 'Trade', value: route.trade })
            );
          })
        )
      : '',
  renderSupportedUnits = (city: CityData): Node => {
    return s(
      `<div class="supported-units"><header>${t(
        'City.SupportedUnits.title'
      )}</header></div>`,
      s(
        '<div class="units"></div>',
        ...city.units.map((unit) => new SupportedUnit(city, unit))
      )
    );
  },
  cityDetails = (
    city: CityData,
    portal: Portal,
    transport: Transport,
    chooseProduction: () => void,
    completeProduction: (spendCost: SpendCost) => void,
    sellImprovement: (
      improvement: CityImprovement,
      saleValue: SpendCost
    ) => void,
    changeSpecialist: (specialist: Specialist) => void,
    readOnly: boolean,
    cityActions: Node | string = ''
  ) => {
    return s(
      '<div class="city-screen"></div>',
      s(
        '<div class="top-row"></div>',
        s(
          '<div class="yield-details"></div>',
          renderPopulation(
            city,
            undefined,
            readOnly ? undefined : changeSpecialist
          ),
          renderYields(city),
          renderSupportedUnits(city)
        ),
        renderMap(portal, city, transport, readOnly),
        renderImprovements(city, sellImprovement, readOnly)
      ),
      s(
        '<div class="bottom-row"></div>',
        renderGrowth(city),
        s(
          '<div class="tabbed-details"></div>',
          // TODO: add a tab bar
          s(
            '<div class="info"></div>',
            renderGarrisonedUnits(city, portal, transport, readOnly),
            renderTradeRoutes(city)
          )
        ),
        renderBuild(city, chooseProduction, completeProduction, readOnly, () =>
          toggleAuto(city.build, transport)
        )
      ),
      cityActions
    );
  },
  // The player's other cities, either side of this one (#678), and renaming it (#676). With one city there is nowhere
  //  to step to, and the buttons do nothing: the list is read when one is pressed, as a city can be gained or lost
  //  while the screen is open.
  renderCityActions = (step: (by: number) => void, rename: () => void): Node =>
    s(
      '<div class="city-actions"></div>',
      h(
        s(
          `<button class="btn-secondary previous">${t(
            'City.previous'
          )}</button>`
        ),
        {
          click: () => step(-1),
        }
      ),
      h(
        s(`<button class="btn-secondary rename">${t('City.rename')}</button>`),
        {
          click: () => rename(),
        }
      ),
      h(s(`<button class="btn-secondary next">${t('City.next')}</button>`), {
        click: () => step(1),
      })
    ),
  // The step through the player's cities, in the order the engine lists them, wrapping at either end (#678).
  steppedCity = (cities: CityData[], city: CityData, by: number): CityData => {
    const index = cities.findIndex(({ id }) => id === city.id);

    if (index === -1 || cities.length < 2) {
      return city;
    }

    return cities[(index + by + cities.length) % cities.length];
  },
  // Enter or X closes the screen, but Enter on a focused button presses that button instead (#484).
  closesScreen = (event: KeyboardEvent): boolean =>
    ['Enter', 'x', 'X'].includes(event.key) &&
    !(
      event.key === 'Enter' &&
      event.target instanceof HTMLElement &&
      event.target.closest('button, [role="button"], input, select') !== null
    ),
  getTreasuryForYield = (player: Player, yieldName: string) =>
    player.treasuries.filter((treasury) => treasury.yield._ === yieldName)[0];

export class City extends Window {
  #city: CityData;
  // Whether the city screen is waiting for what the city can build, to open the production picker (#484).
  #choosingProduction = false;
  #portal: Portal;
  #readOnly: boolean;
  // Whether a specialist has been changed and the city not yet updated with it. Changing one replaces it, so a second
  //  change sent before then would name a specialist the city no longer has, and be lost (#484).
  #specialistChanging = false;
  #transport: Transport;
  // None for a rival's city, which isn't kept up to date.
  #unwatch: (() => void) | null = null;

  /**
   * With `readOnly`, as for a rival's city a Diplomat has investigated (#58), the screen shows the city as it was sent
   * and changes nothing: no production, worked tiles, specialists or buying, and no updates.
   */
  constructor(
    city: CityData,
    portal: Portal,
    transport: Transport,
    { readOnly = false }: { readOnly?: boolean } = {}
  ) {
    super(
      // The title is HTML, and a name the player typed (#676) is text.
      escape(cityName(city)),
      cityDetails(
        city,
        portal,
        transport,
        () => this.changeProduction(),
        (spendCost: SpendCost) => this.completeProduction(spendCost),
        (improvement: CityImprovement, saleValue: SpendCost) =>
          this.sellImprovement(improvement, saleValue),
        (specialist: Specialist) => this.#changeSpecialist(specialist),
        readOnly,
        readOnly
          ? ''
          : renderCityActions(
              (by: number) => this.step(by),
              () => this.rename()
            )
      ),
      {
        canResize: true,
        canMaximise: true,
        classes: 'city-screen-window',
        size: 'maximised',
      }
    );

    this.#city = city;
    this.#portal = portal;
    this.#readOnly = readOnly;
    this.#transport = transport;

    if (!readOnly) {
      this.#watch();
    }

    this.on('keydown', (event) => {
      if (readOnly) {
        if (closesScreen(event)) {
          this.close();
        }

        return;
      }

      if (['c', 'C'].includes(event.key)) {
        this.changeProduction();

        event.preventDefault();
        event.stopPropagation();
      }

      // Auto on or off (#194).
      if (['a', 'A'].includes(event.key)) {
        toggleAuto(this.#city.build, this.#transport);

        event.preventDefault();
        event.stopPropagation();
      }

      if (['b', 'B'].includes(event.key)) {
        const buyButtons = this.queryAll('button.buy');

        if (!buyButtons.length) {
          return;
        }

        // TODO: handle this scenario properly
        // if (buyButtons.length > 1) {
        //
        // }

        emit(buyButtons[0], new MouseEvent('click'));

        event.preventDefault();
        event.stopPropagation();
      }

      // The previous or next city (#678). Not inside a field, where they move the caret.
      if (
        ['ArrowLeft', 'ArrowRight'].includes(event.key) &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest('input, select, textarea') !== null
        )
      ) {
        this.step(event.key === 'ArrowLeft' ? -1 : 1);

        event.preventDefault();
        event.stopPropagation();

        return;
      }

      if (!event.ctrlKey && !event.altKey && !event.metaKey) {
        const specialist = specialistForKey(
          event.key,
          this.#city.specialists ?? []
        );

        if (specialist) {
          this.#changeSpecialist(specialist);

          event.preventDefault();
          event.stopPropagation();
        }
      }

      if (closesScreen(event)) {
        this.close();
      }
    });
  }

  #details(city: CityData): Node {
    return cityDetails(
      city,
      this.#portal,
      this.#transport,
      () => this.changeProduction(),
      (spendCost: SpendCost) => this.completeProduction(spendCost),
      (improvement: CityImprovement, saleValue: SpendCost) =>
        this.sellImprovement(improvement, saleValue),
      (specialist: Specialist) => this.#changeSpecialist(specialist),
      this.#readOnly,
      this.#readOnly
        ? ''
        : renderCityActions(
            (by: number) => this.step(by),
            () => this.rename()
          )
    );
  }

  // The player's cities as the page holds them now, which a step goes through (#678).
  #cities(): CityData[] {
    return this.#city.player.cities ?? [this.#city];
  }

  #watch(): void {
    this.#unwatch = watchCity(this.#city, {
      update: (updatedCity, _data, goldOnly) => {
        // Read before the redraw, which takes away whatever had the focus inside the screen.
        const focusedWindow =
          document.activeElement?.closest('dialog.window') ?? null;

        this.#city = updatedCity;

        // A name changed (#676) shows at once.
        this.setTitle(escape(cityName(updatedCity)));
        this.update(this.#details(updatedCity));

        // The specialists drawn now are the city's latest, so they can be changed again.
        this.#specialistChanging = false;

        // Back to the screen if the redraw took it from inside it. Not from a window open over the screen, a
        //  production picker or a confirmation, where the next Enter is meant for that window (#484); and for a
        //  change to the player's gold alone, which can come at any time, not from anywhere else either (#503).
        if (
          focusedWindow === this.element() ||
          (focusedWindow === null && !goldOnly)
        ) {
          this.element().focus();
        }
      },
      // Captured or destroyed.
      close: () => this.close(),
    });
  }

  /**
   * Shows the player's city `by` places along from this one, wrapping at either end (#678). The screen is filled
   * again for it rather than closed and opened, and starts afresh: watching that city, with no specialist change or
   * production picker of the last one's outstanding.
   */
  step(by: number): void {
    if (this.#readOnly) {
      return;
    }

    const city = steppedCity(this.#cities(), this.#city, by);

    if (city === this.#city || city.id === this.#city.id) {
      return;
    }

    this.#unwatch?.();

    this.#city = city;
    this.#choosingProduction = false;
    this.#specialistChanging = false;

    this.setTitle(escape(cityName(city)));
    this.update(this.#details(city));
    this.#watch();

    // The buttons it was pressed with have gone with the redraw.
    this.element().focus();
  }

  // The "City name" box, and the name it gives sent to the worker, which decides whether it stands (#676).
  rename(): void {
    if (this.#readOnly) {
      return;
    }

    const city = this.#city,
      shown = cityName(city);

    // The name as shown, which a translation may have changed: left as it is, it is not a new name.
    new CityNameWindow(shown, (name) => {
      if (name === shown) {
        return;
      }

      this.#transport.send('action', {
        name: 'RenameCity',
        id: city.id,
        cityName: name,
      });
    });
  }

  async changeProduction(): Promise<void> {
    // Asked again before the first answer came: one picker is enough (#484).
    if (this.#choosingProduction) {
      return;
    }

    this.#choosingProduction = true;

    const cityBuild = this.#city.build;

    let available;

    try {
      available = await this.#transport.request(
        new CityBuildAvailable(cityBuild.id)
      );
    } catch (error) {
      // Not answered: the player has been told, and can ask again (#580).
      unlessRequestFailed(error);

      return;
    } finally {
      // Not once the screen has stepped on, which has cleared it already, and may be asking for the next city (#678).
      if (this.#city.build.id === cityBuild.id) {
        this.#choosingProduction = false;
      }
    }

    // Closed while waiting: the picker would open over the map (#484). Or moved on to another city (#678), which the
    //  list isn't for.
    if (!this.element().isConnected || this.#city.build.id !== cityBuild.id) {
      return;
    }

    new CityBuildSelectionWindow(
      this.#city.build,
      available,
      this.#transport,
      () => this.element().focus()
    );
  }

  #changeSpecialist(specialist: Specialist): void {
    if (this.#specialistChanging) {
      return;
    }

    this.#specialistChanging = true;

    this.#transport.send('action', {
      name: 'ChangeSpecialist',
      id: specialist.id,
    });
  }

  close(): void {
    this.#unwatch?.();

    super.close();
  }

  completeProduction(spendCost: SpendCost): void {
    // The city the confirmation is for, whichever the screen has stepped to by the time it's answered (#678).
    const city = this.#city,
      cityBuild = city.build;

    if (!cityBuild.building) {
      return;
    }

    const treasury = getTreasuryForYield(city.player, spendCost.resource._);

    new ConfirmationWindow(
      t('ConfirmationWindow.Generic.title'),
      t('City.CompleteProduction.body', {
        item: getLabelForBuildableEntity(cityBuild.building.item),
        spendCost,
        treasury,
      }),
      () =>
        this.#transport.send('action', {
          name: 'CompleteProduction',
          id: cityBuild.id,
          treasury: treasury.id,
        })
    );
  }

  sellImprovement(improvement: CityImprovement, saleValue: SpendCost): void {
    // As for buying: the city it was opened for (#678).
    const city = this.#city,
      treasury = getTreasuryForYield(city.player, saleValue.resource._);

    new ConfirmationWindow(
      t('ConfirmationWindow.Generic.title'),
      t('City.SellImprovement.body', {
        item: getLabelForBuildableEntity(improvement),
        saleValue,
      }),
      () =>
        this.#transport.send('action', {
          name: 'SellImprovement',
          id: city.id,
          improvement: improvement.id,
          treasury: treasury.id,
        })
    );
  }
}

export default City;
