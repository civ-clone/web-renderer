import {
  City as CityData,
  CityImprovementMaintenanceGold,
  PlainObject,
  Player,
  PlayerTreasury,
  SpendCost,
  Unit as UnitData,
  Yield,
} from '../types';
import { emit, s } from '@dom111/element';
import {
  getLabelForBuildable,
  getLabelForBuildableEntity,
} from './lib/cityBuild';
import { knownGroupLookup, knownGroups } from '../lib/yieldMap';
import {
  renderPopulation,
  renderProgress,
  yieldImages,
} from './lib/cityYields';
import Cities from './Map/Cities';
import CityBuildSelectionWindow from './CityBuildSelectionWindow';
import ConfirmationWindow from './ConfirmationWindow';
import DataObserver from '../DataObserver';
import Feature from './Map/Feature';
import Fog from './Map/Fog';
import Improvements from './Map/Improvements';
import Irrigation from './Map/Irrigation';
import Land from './Map/Land';
import Portal from './Portal';
import SupportedUnit from './SupportedUnit';
import Terrain from './Map/Terrain';
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
import { t } from 'i18next';

const reduceYield = (type: string, cityYields: Yield[]): [number, number] =>
    cityYields
      .filter((cityYield) => knownGroupLookup[type].includes(cityYield._))
      .reduce(
        ([used, free], cityYield) => [
          used + (cityYield.value < 0 ? -cityYield.value : 0),
          free + cityYield.value,
        ],
        [0, 0]
      ),
  renderYields = (city: CityData): Node => {
    return s(
      '<div class="yields-detail"></div>',
      ...[
        ['Food'],
        ['Production'],
        ['Trade'],
        ['Luxuries', 'Gold', 'Research'],
      ].map((cityYieldNames) =>
        s(
          `<div class="yields" data-yields="${cityYieldNames.join(
            ' '
          )}"></div>`,
          ...cityYieldNames.map((cityYieldName) =>
            s(
              `<span class="yield" data-yield="${cityYieldName}"></span>`,
              ...reduceYield(cityYieldName, city.yields).map((n, i) =>
                s(
                  `<span class="${['used', 'free'][i]}"></span>`,
                  ...yieldImages({
                    _: cityYieldName,
                    value: n,
                  })
                )
              )
            )
          )
        )
      ),
      // Other, unknown yields
      ...Object.entries(
        city.yields
          .filter(
            (cityYield) => !Object.keys(knownGroups).includes(cityYield._)
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
      const [used, free] = Array.from(container.children);

      while (used.scrollWidth + free.scrollWidth > container.clientWidth) {
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
  renderMap = (portal: Portal, city: CityData, transport: Transport): Node => {
    const portalCanvas = s<HTMLCanvasElement>('<canvas></canvas>'),
      cityPortal = new Portal(
        new World({
          ...city.player.world,
          tiles: city.tiles,
        }),
        transport,
        portalCanvas,
        {
          playerId: city.player.id,
          scale: portal.scale(),
          tileSize: portal.tileSize() / portal.scale(),
        },
        Land,
        Irrigation,
        Terrain,
        Improvements,
        Feature,
        Fog,
        Cities,
        Units,
        Yields,
        Unworkable
      );

    portalCanvas.height = portal.tileSize() * 5;
    portalCanvas.width = portal.tileSize() * 5;

    cityPortal.setCenter(city.tile.x, city.tile.y);
    cityPortal.build(city.tiles);

    const unitMap = cityPortal.getLayer(Units)!;
    unitMap.render(
      city.tiles.filter((tile) =>
        tile.units.some((unit) => unit.player.id !== city.player.id)
      )
    );

    const yieldMap = cityPortal.getLayer(Yields)!;
    yieldMap.render(city.tilesWorked);

    const unworkable = cityPortal.getLayer(Unworkable)!;
    unworkable.setCity(city);
    unworkable.render(city.tiles);

    cityPortal.render();

    return h(s('<div class="city-map"></div>', portalCanvas), {
      click: () =>
        transport.send('action', {
          name: 'ReassignWorkers',
          city: city.id,
        }),
    });
  },
  renderBuild = (
    city: CityData,
    chooseProduction: () => void,
    completeProduction: (spendCost: SpendCost) => void
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
            }) as string)
      ),
      h(
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
      ...city.build.spendCost.map((spendCost) =>
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
  renderImprovements = (city: CityData): Node => {
    return s(
      `<div class="improvements"></div>`,
      s(
        `<div></div>`,
        ...city.improvements.map((improvement) =>
          s(
            `<div>${t(`Improvement.${improvement._}.name`, {
              defaultValue: improvement._,
              ns: 'city',
            })}</div>`,
            ...city.yields
              .filter(
                (
                  cityYield: Yield | CityImprovementMaintenanceGold
                ): cityYield is CityImprovementMaintenanceGold =>
                  cityYield._ === 'CityImprovementMaintenanceGold' &&
                  cityYield.cityImprovement.id === improvement.id
              )
              .flatMap((cityYield) => yieldImages(cityYield, true))
          )
        )
      )
    );
  },
  renderGarrisonedUnits = (city: CityData, transport: Transport): Node => {
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

          if (cityPlayerUnits.length === 0) {
            return;
          }

          new UnitSelectionWindow(cityPlayerUnits, transport);
        },
      }
    );
  },
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
    completeProduction: (spendCost: SpendCost) => void
  ) => {
    return s(
      '<div class="city-screen"></div>',
      s(
        '<div class="top-row"></div>',
        s(
          '<div class="yield-details"></div>',
          renderPopulation(city),
          renderYields(city),
          renderSupportedUnits(city)
        ),
        renderMap(portal, city, transport),
        renderImprovements(city)
      ),
      s(
        '<div class="bottom-row"></div>',
        renderGrowth(city),
        s(
          '<div class="tabbed-details"></div>',
          // TODO: add a tab bar
          s('<div class="info"></div>', renderGarrisonedUnits(city, transport))
        ),
        renderBuild(city, chooseProduction, completeProduction)
      )
    );
  },
  getTreasuryForYield = (player: Player, yieldName: string) =>
    player.treasuries.filter((treasury) => treasury.yield._ === yieldName)[0];

export class City extends Window {
  #city: CityData;
  #dataObserver: DataObserver;
  #portal: Portal;
  #transport: Transport;
  #treasury: PlayerTreasury;

  constructor(city: CityData, portal: Portal, transport: Transport) {
    super(
      cityName(city),
      cityDetails(
        city,
        portal,
        transport,
        () => this.changeProduction(),
        (spendCost: SpendCost) => this.completeProduction(spendCost)
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
    this.#treasury = getTreasuryForYield(city.player, 'Gold');
    this.#dataObserver = new DataObserver(
      [
        city.id,
        city.build.id,
        city.growth.id,
        ...city.units.map((unit) => unit.id),
        getTreasuryForYield(city.player, 'Gold').id,
      ],
      (data: PlainObject) => {
        const [updatedCity] = (
          (data.player?.cities ?? []) as CityData[]
        ).filter((cityData: CityData) => city.id === cityData.id);

        this.#treasury = getTreasuryForYield(data.player, 'Gold');

        // City must have been captured or destroyed
        if (!updatedCity) {
          this.close();

          return;
        }

        this.#city = updatedCity;

        this.#dataObserver.setIds([
          updatedCity.id,
          updatedCity.build.id,
          updatedCity.growth.id,
          ...updatedCity.units.map((unit) => unit.id),
        ]);

        this.update(
          cityDetails(
            updatedCity,
            this.#portal,
            transport,
            () => this.changeProduction(),
            (spendCost: SpendCost) => this.completeProduction(spendCost)
          )
        );

        this.element().focus();

        setTimeout(() => resizeYields(this.element()), 200);
      }
    );

    this.on('keydown', (event) => {
      if (['c', 'C'].includes(event.key)) {
        this.changeProduction();

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

      if (['Enter', 'x', 'X'].includes(event.key)) {
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

  changeProduction(): void {
    new CityBuildSelectionWindow(this.#city.build, this.#transport, () =>
      this.element().focus()
    );
  }

  close(): void {
    this.#dataObserver.dispose();

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
}

export default City;
