import {
  City as CityData,
  CityGrowth,
  CityImprovementMaintenanceGold,
  MilitaryUnhappiness,
  PlainObject,
  Unit as UnitData,
  UnitSupportFood,
  UnitSupportProduction,
  Yield,
} from '../types';
import { e, h, t } from '../lib/html';
import { knownGroupLookup, knownGroups, knownIcons } from '../lib/yieldMap';
import Cities from './Map/Cities';
import CityBuildSelectionWindow from './CityBuildSelectionWindow';
import ConfirmationWindow from './ConfirmationWindow';
import DataObserver from '../DataObserver';
import Feature from './Map/Feature';
import Fog from './Map/Fog';
import Improvements from './Map/Improvements';
import InactiveUnitSelectionWindow from './InactiveUnitSelectionWindow';
import Irrigation from './Map/Irrigation';
import Land from './Map/Land';
import Portal from './Portal';
import Terrain from './Map/Terrain';
import Transport from '../../Engine/Transport';
import Window from './Window';
import World from './World';
import Yields from './Map/Yields';
import Unit from './Unit';
import { assetStore } from '../AssetStore';

const buildTurns = (city: CityData) =>
    Math.max(
      1,
      Math.ceil(
        (city.build.cost.value - city.build.progress.value) /
          city.yields
            .filter((cityYield) =>
              knownGroupLookup.Production.includes(cityYield._)
            )
            .reduce((total, cityYield) => total + cityYield.value, 0)
      )
    ),
  growthTurns = (city: CityData) =>
    Math.max(
      1,
      Math.ceil(
        (city.growth.cost.value - city.growth.progress.value) /
          city.yields
            .filter((cityYield) => knownGroupLookup.Food.includes(cityYield._))
            .reduce((total, cityYield) => total + cityYield.value, 0)
      )
    ),
  renderPopulation = (city: CityData): Node => {
    const growth = city.growth,
      mask = parseInt(city.name.replace(/[^a-z]/gi, ''), 36).toString(2);

    let [happiness, unhappiness] = city.yields.reduce(
      ([happiness, unhappiness], cityYield) => {
        if (knownGroupLookup.Happiness.includes(cityYield._)) {
          happiness += cityYield.value;
        }

        if (knownGroupLookup.Unhappiness.includes(cityYield._)) {
          unhappiness += cityYield.value;
        }

        return [happiness, unhappiness];
      },
      [0, 0]
    );

    const state = new Array(growth.size).fill(1);

    let currentIndex = state.length - 1;

    while (unhappiness > 0 && currentIndex > -1) {
      state[currentIndex--] = 0;
      unhappiness--;
    }

    currentIndex = 0;

    while (happiness > 0 && currentIndex < state.length) {
      if (state[currentIndex] === 0) {
        state[currentIndex]++;
        happiness--;
      }

      if (state[currentIndex] === 1) {
        state[currentIndex++]++;
        happiness--;
      }

      if (state[currentIndex] === 2) {
        currentIndex++;
      }
    }

    const population = e('div.population');

    state.forEach((status, index) =>
      assetStore
        .getScaled(
          `./assets/city/people_${['unhappy', 'content', 'happy'][status]}_${
            ['f', 'm'][parseInt(mask[index % mask.length], 10)]
          }.png`,
          2
        )
        .then((image) =>
          population.append(
            e('span.citizen', e(`img[src="${image.toDataURL('image/png')}"]`))
          )
        )
    );

    return population;
  },
  reduceYield = (type: string, cityYields: Yield[]): [number, number] =>
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
    return e(
      'div.yields-detail',
      ...[
        ['Food'],
        ['Production'],
        ['Trade'],
        ['Luxuries', 'Gold', 'Research'],
      ].map((cityYieldNames) =>
        e(
          `div.yields[data-yields="${cityYieldNames.join(' ')}"]`,
          ...cityYieldNames.map((cityYieldName) =>
            e(
              `span.yield[data-yield="${cityYieldName}"]`,
              ...reduceYield(cityYieldName, city.yields).map((n, i) =>
                e(
                  `span.${['used', 'free'][i]}`,
                  ...yieldImages({
                    id: '',
                    _: cityYieldName,
                    value: n,
                    values: [],
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
      ).map(([label, value]) =>
        e('div', e('div', t(label)), e('div', t(value)))
      )
    );
  },
  renderMap = (portal: Portal, city: CityData, transport: Transport): Node => {
    const portalCanvas = e('canvas') as HTMLCanvasElement,
      cityPortal = new Portal(
        new World(city.player.world),
        transport,
        portalCanvas,
        {
          playerId: city.player.id,
          scale: portal.scale(),
          tileSize: portal.tileSize(),
        },
        Land,
        Irrigation,
        Terrain,
        Improvements,
        Feature,
        Fog,
        Cities,
        Yields
      );

    portalCanvas.height = portal.tileSize() * portal.scale() * 5;
    portalCanvas.width = portal.tileSize() * portal.scale() * 5;

    cityPortal.setCenter(city.tile.x, city.tile.y);
    cityPortal.build(city.tiles);

    const yieldMap = cityPortal.getLayer(Yields) as Yields;
    yieldMap.render(city.tilesWorked);

    cityPortal.render();

    return h(e('div.city-map', portalCanvas), {
      click: () =>
        transport.send('action', {
          name: 'ReassignWorkers',
          city: city.id,
        }),
    });
  },
  yieldImages = (cityYield: Yield): Node[] =>
    new Array(Math.abs(cityYield.value)).fill(0).map(() => {
      const icon = e('span.yield-icon');

      assetStore
        .getScaled(`./assets/${knownIcons[knownGroups[cityYield._]]}`, 2)
        .then((image) => {
          icon.append(e(`img[src="${image.toDataURL('image/png')}"]`));
        });

      return icon;
    }),
  renderBuildDetails = (
    city: CityData,
    chooseProduction: () => void,
    completeProduction: () => void
  ): HTMLElement => {
    const turnsLeft = buildTurns(city);

    return e(
      'div.build',
      e(
        'header',
        t(
          `Building ${
            city.build.building ? city.build.building.item._ : 'nothing'
          }`
        )
      ),
      h(e('button', t(city.build.building ? 'Change' : 'Choose')), {
        click() {
          chooseProduction();
        },
      }),
      h(e('button', t('Buy')), {
        click() {
          completeProduction();
        },
      }),
      city.build.building
        ? e(
            'p',
            t(
              `Progress ${city.build.progress.value} / ${
                city.build.cost.value
              } (${turnsLeft} turn${turnsLeft === 1 ? '' : 's'})`
            )
          )
        : t('')
    );
  },
  renderGrowth = (city: CityData): Node => {
    const growth: CityGrowth = city.growth,
      turnsLeft = growthTurns(city);

    return e(
      'div.growth',
      e('header', t('Growth')),
      e('p', t(`Size ${growth.size.toString()}`)),
      e(
        'p',
        t(
          `Progress ${city.build.progress.value} / ${
            city.build.cost.value
          } (${turnsLeft} turn${turnsLeft === 1 ? '' : 's'})`
        )
      )
    );
  },
  renderImprovements = (city: CityData): Node => {
    return e(
      'div.improvements',
      e(
        'div',
        ...city.improvements.map((improvement) =>
          e(
            'div',
            t(improvement._),
            ...city.yields
              .filter(
                (cityYield): cityYield is CityImprovementMaintenanceGold =>
                  cityYield._ === 'CityImprovementMaintenanceGold'
              )
              .filter(
                (cityYield) => cityYield.cityImprovement.id === improvement.id
              )
              .flatMap((cityYield) => yieldImages(cityYield))
          )
        )
      )
    );
  },
  renderGarrisonedUnits = (city: CityData, transport: Transport): Node => {
    return h(
      e(
        'div.garrisoned-units',
        e('header', t('Garrisoned Units')),
        e(
          'div.units',
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

          new InactiveUnitSelectionWindow(cityPlayerUnits, transport);
        },
      }
    );
  },
  renderSupportedUnits = (city: CityData): Node => {
    return e(
      'div.supported-units',
      e('header', t('Supported Units')),
      e(
        'div.units',
        ...city.units.map((unit) =>
          e(
            'span.unit',
            new Unit(unit).element(),
            ...city.yields
              .filter(
                (
                  cityYield
                ): cityYield is
                  | UnitSupportFood
                  | UnitSupportProduction
                  | MilitaryUnhappiness =>
                  [
                    'UnitSupportFood',
                    'UnitSupportProduction',
                    'MilitaryUnhappiness',
                  ].includes(cityYield._)
              )
              .filter((cityYield) => cityYield.unit.id === unit.id)
              .flatMap((cityYield) => yieldImages(cityYield))
          )
        )
      )
    );
  },
  buildDetails = (
    city: CityData,
    portal: Portal,
    transport: Transport,
    chooseProduction: () => void,
    completeProduction: () => void
  ) => {
    return e(
      'div.city-screen',
      e(
        'div.top-row',
        e(
          'div.yield-details',
          renderPopulation(city),
          renderYields(city),
          renderSupportedUnits(city)
        ),
        renderMap(portal, city, transport),
        renderImprovements(city)
      ),
      e(
        'div.bottom-row',
        renderGrowth(city),
        e(
          'div.tabbed-details',
          // TODO: add a tab bar
          e('div.info', renderGarrisonedUnits(city, transport))
        ),
        renderBuildDetails(city, chooseProduction, completeProduction)
      )
    );
  };

export class City extends Window {
  #city: CityData;
  #dataObserver: DataObserver;
  #portal: Portal;
  #transport: Transport;

  constructor(city: CityData, portal: Portal, transport: Transport) {
    super(
      city.name,
      buildDetails(
        city,
        portal,
        transport,
        () => this.changeProduction(),
        () => this.completeProduction()
      ),
      {
        size: 'maximised',
      }
    );

    this.element().classList.add('city-screen-window');

    this.#city = city;
    this.#portal = portal;
    this.#transport = transport;
    this.#dataObserver = new DataObserver(
      [
        city.id,
        city.build.id,
        city.growth.id,
        ...city.units.map((unit) => unit.id),
      ],
      (data: PlainObject) => {
        const [updatedCity] = (
          (data.player?.cities ?? []) as CityData[]
        ).filter((cityData: CityData) => city.id === cityData.id);

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
          buildDetails(
            updatedCity,
            this.#portal,
            transport,
            () => this.changeProduction(),
            () => this.completeProduction()
          )
        );

        this.element().focus();
      }
    );

    this.element().addEventListener('keydown', (event) => {
      if (['c', 'C'].includes(event.key)) {
        this.changeProduction();

        event.preventDefault();
        event.stopPropagation();
      }

      if (['b', 'B'].includes(event.key)) {
        this.completeProduction();

        event.preventDefault();
        event.stopPropagation();
      }

      if (['Enter', 'x', 'X'].includes(event.key)) {
        this.close();
      }
    });
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

  completeProduction(): void {
    if (!this.#city.build.building) {
      return;
    }

    new ConfirmationWindow(
      'Are you sure?',
      `Do you want to rush building of ${this.#city.build.building.item._}`,
      () =>
        this.#transport.send('action', {
          name: 'CompleteProduction',
          id: this.#city.id,
        })
    );
  }
}

export default City;
