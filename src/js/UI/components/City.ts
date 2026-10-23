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
import { splitYield, yieldGroup } from '../lib/yieldMap';
import cityMapLayout from '../lib/cityMapLayout';
import { tileBounds } from '../lib/projection';
import {
  renderPopulation,
  renderProgress,
  yieldImages,
} from './lib/cityYields';
import Cities from './Map/Cities';
import CityBuildAvailable from '../../Engine/Requests/CityBuildAvailable';
import CityBuildSelectionWindow from './CityBuildSelectionWindow';
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
import { h } from '../lib/html';
import { instance as localeProvider } from '../LocaleProvider';
import instanceOf from '../lib/instanceOf';
import isAnarchy from './lib/government';
import { specialistForKey } from '../lib/specialists';
import { t } from 'i18next';
import watchCity from './lib/watchCity';

// The yield rows the city screen draws. This is the screen's layout, not a rule: the groups themselves come from the
//  engine's class ancestry.
const yieldRows = [
  ['Food'],
  ['Production'],
  ['Trade'],
  ['Luxuries', 'Gold', 'Research'],
];

// The groups drawn elsewhere on the screen: the rows above, and the citizens, which show Happiness and Unhappiness.
const drawnYieldGroups = [...yieldRows.flat(), 'Happiness', 'Unhappiness'];

const renderYields = (city: CityData): Node => {
    return s(
      '<div class="yields-detail"></div>',
      ...yieldRows.map((cityYieldNames) =>
        s(
          `<div class="yields" data-yields="${cityYieldNames.join(
            ' '
          )}"></div>`,
          ...cityYieldNames.map((cityYieldName) =>
            s(
              `<span class="yield" data-yield="${cityYieldName}"></span>`,
              ...Object.entries(splitYield(cityYieldName, city.yields)).map(
                ([part, value]) => {
                  const span = s(
                    `<span class="${part}"></span>`,
                    ...yieldImages({
                      _: cityYieldName,
                      value,
                    })
                  );

                  // Colour alone doesn't say that the city is short.
                  if (part === 'deficit' && value > 0) {
                    const label = t('City.Yield.deficit', {
                      amount: value,
                      yield: t(`${cityYieldName}.name`, {
                        defaultValue: cityYieldName,
                        ns: 'yield',
                      }),
                    });

                    span.setAttribute('title', label);
                    span.setAttribute('role', 'img');
                    span.setAttribute('aria-label', label);
                  }

                  return span;
                }
              )
            )
          )
        )
      ),
      // How much the city pollutes, from the engine's `pollution` data (#402), below the yields as one more row. Civ1
      //  draws it as smokestacks at the bottom of its info panel.
      ...((city.pollution ?? 0) > 0
        ? [
            s(
              '<div class="yields" data-yields="Pollution"></div>',
              s(
                `<span class="yield" data-yield="Pollution" role="img" title="${t(
                  'City.pollution',
                  { count: city.pollution }
                )}" aria-label="${t('City.pollution', {
                  count: city.pollution,
                })}"></span>`,
                s(
                  '<span class="free"></span>',
                  ...yieldImages({ _: 'Pollution', value: city.pollution! })
                )
              )
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
      ).map(([key, value]) =>
        s(
          `<div><div>${t(`${key}.name`, {
            defaultValue: key,
            ns: 'yield',
          })}</div><div>${value}</div></div>`
        )
      )
    );
  },
  resizeYields = (element: HTMLElement) => {
    const yieldWrappers = element.querySelectorAll('.yields-detail .yield')!;

    Array.from(yieldWrappers).forEach((container) => {
      const parts = Array.from(container.children);

      while (
        parts.reduce((width, part) => width + part.scrollWidth, 0) >
        container.clientWidth
      ) {
        const currentMaxWidth = parseInt(
          container.getAttribute('data-max-width') || '14',
          10
        );

        if (currentMaxWidth === 0) {
          break;
        }

        container.setAttribute(
          'data-max-width',
          (currentMaxWidth - 1).toString()
        );
      }
    });
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
        height: localHeight,
        tiles: localTiles,
        tilesWorked: localTilesWorked,
        width: localWidth,
      } = cityMapLayout(city),
      portalCanvas = s<HTMLCanvasElement>('<canvas></canvas>'),
      cityPortal = new Portal(
        new World({
          ...city.player.world,
          width: localWidth,
          height: localHeight,
          tiles: localTiles,
        }),
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
      readOnly
        ? ''
        : h(
            s(
              `<button>${t(
                city.build.building ? 'City.Build.change' : 'City.Build.choose'
              )}</button>`
            ),
            {
              click() {
                chooseProduction();
              },
            }
          ),
      readOnly
        ? ''
        : h(s(`<button class="auto">${getAutoLabel(city.build)}</button>`), {
            click() {
              toggleAutoProduction();
            },
          }),
      ...(readOnly ? [] : city.build.spendCost).map((spendCost) =>
        h(
          s(
            `<button class="buy" data-resource="${spendCost.resource._}">${t(
              'City.Build.buy-with',
              {
                spendCost,
              }
            )}</button>`
          ),
          {
            click() {
              completeProduction(spendCost);
            },
          }
        )
      ),
      city.build.building
        ? s(`<p>${renderProgress(city.build, city.yields, 'Production')}</p>`)
        : ''
    ),
  renderGrowth = (city: CityData): Node =>
    s(
      `<div class="growth"><header>${t('City.Growth.title')}</header><p>${t(
        'City.Growth.size',
        {
          size: localeProvider.number(city.growth.size),
        }
      )}</p><p>${renderProgress(city.growth, city.yields, 'Food')}</p></div>`
    ),
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
                ),
            row = s(
              saleValue
                ? `<button class="sell">${getLabelForBuildableEntity(
                    improvement
                  )}</button>`
                : `<div>${getLabelForBuildableEntity(improvement)}</div>`,
              ...city.yields
                .filter(
                  (
                    cityYield: Yield | CityImprovementMaintenanceGold
                  ): cityYield is CityImprovementMaintenanceGold =>
                    cityYield._ === 'CityImprovementMaintenanceGold' &&
                    cityYield.cityImprovement.id === improvement.id
                )
                .flatMap((cityYield) => yieldImages(cityYield, true))
            );

          // Selling an improvement, as clicking it in Civ1's list does (#31).
          return saleValue
            ? h(row, {
                click() {
                  sellImprovement(improvement, saleValue);
                },
              })
            : row;
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
          ...city.tradeRoutes.map((route) =>
            s(
              `<p>${t('City.trade-route', {
                // Already escaped by `Generic.city-name`, so not again (as `TopCitiesReport` does).
                city: t('Generic.city-name', {
                  civilization: route.civilization,
                  name: route.name,
                }),
                trade: route.trade,
                interpolation: { escapeValue: false },
              })}</p>`
            )
          )
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
    readOnly: boolean
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
      )
    );
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
      cityName(city),
      cityDetails(
        city,
        portal,
        transport,
        () => this.changeProduction(),
        (spendCost: SpendCost) => this.completeProduction(spendCost),
        (improvement: CityImprovement, saleValue: SpendCost) =>
          this.sellImprovement(improvement, saleValue),
        (specialist: Specialist) => this.#changeSpecialist(specialist),
        readOnly
      ),
      {
        canResize: true,
        canMaximise: true,
        classes: 'city-screen-window',
        size: 'maximised',
      }
    );

    setTimeout(() => resizeYields(this.element()), 200);

    this.#city = city;
    this.#portal = portal;
    this.#transport = transport;

    if (!readOnly) {
      this.#unwatch = watchCity(city, {
        update: (updatedCity, _data, goldOnly) => {
          // Read before the redraw, which takes away whatever had the focus inside the screen.
          const focusedWindow =
            document.activeElement?.closest('dialog.window') ?? null;

          this.#city = updatedCity;

          this.update(
            cityDetails(
              updatedCity,
              this.#portal,
              transport,
              () => this.changeProduction(),
              (spendCost: SpendCost) => this.completeProduction(spendCost),
              (improvement: CityImprovement, saleValue: SpendCost) =>
                this.sellImprovement(improvement, saleValue),
              (specialist: Specialist) => this.#changeSpecialist(specialist),
              false
            )
          );

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

          setTimeout(() => resizeYields(this.element()), 200);
        },
        // Captured or destroyed.
        close: () => this.close(),
      });
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

    const resizeHandler = () =>
      setTimeout(() => resizeYields(this.element()), 200);

    this.on('close', () => window.removeEventListener('resize', resizeHandler));

    window.addEventListener('resize', resizeHandler);

    this.on('close', () => this.off('resize', resizeHandler));

    this.on('resize', resizeHandler);
  }

  async changeProduction(): Promise<void> {
    // Asked again before the first answer came: one picker is enough (#484).
    if (this.#choosingProduction) {
      return;
    }

    this.#choosingProduction = true;

    let available;

    try {
      available = await this.#transport.request(
        new CityBuildAvailable(this.#city.build.id)
      );
    } finally {
      this.#choosingProduction = false;
    }

    // Closed while waiting: the picker would open over the map (#484).
    if (!this.element().isConnected) {
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
    const cityBuild = this.#city.build;

    if (!cityBuild.building) {
      return;
    }

    const treasury = getTreasuryForYield(
      this.#city.player,
      spendCost.resource._
    );

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
          id: this.#city.build.id,
          treasury: treasury.id,
        })
    );
  }

  sellImprovement(improvement: CityImprovement, saleValue: SpendCost): void {
    const treasury = getTreasuryForYield(
      this.#city.player,
      saleValue.resource._
    );

    new ConfirmationWindow(
      t('ConfirmationWindow.Generic.title'),
      t('City.SellImprovement.body', {
        item: getLabelForBuildableEntity(improvement),
        saleValue,
      }),
      () =>
        this.#transport.send('action', {
          name: 'SellImprovement',
          id: this.#city.id,
          improvement: improvement.id,
          treasury: treasury.id,
        })
    );
  }
}

export default City;
