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
import {
  knownGroupLookup,
  knownGroups,
  knownIcons,
  reduceKnownYield,
  reduceKnownYields,
} from '../lib/yieldMap';
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
import Terrain from './Map/Terrain';
import Transport from '../../Engine/Transport';
import Unit from './Unit';
import UnitSelectionWindow from './UnitSelectionWindow';
import Window from './Window';
import World from './World';
import Yields from './Map/Yields';
import { assetStore } from '../AssetStore';
import { h } from '../lib/html';
import { s } from '@dom111/element';

const buildTurns = (city: CityData) =>
    Math.max(
      1,
      Math.ceil(
        (city.build.cost.value - city.build.progress.value) /
          reduceKnownYield(city, 'Production')
      )
    ),
  growthTurns = (city: CityData) =>
    Math.max(
      1,
      Math.ceil(
        (city.growth.cost.value - city.growth.progress.value) /
          reduceKnownYield(city, 'Food')
      )
    ),
  renderPopulation = (city: CityData): Node => {
    const growth = city.growth,
      mask = parseInt(city.name.replace(/[^a-z]/gi, ''), 36).toString(2),
      state = new Array(growth.size).fill(1),
      population = s('<div class="population"></div>');

    let [happiness, unhappiness] = reduceKnownYields(
        city,
        'Happiness',
        'Unhappiness'
      ),
      currentIndex = state.length - 1;

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
            s(
              '<span class="citizen"></span>',
              s(`<img src="${image.toDataURL('image/png')}">`)
            )
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
        s(`<div><div>${label}</div><div>${value}</div></div>`)
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
        new World(city.player.world),
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
        Yields
      );

    portalCanvas.height = portal.tileSize() * 5;
    portalCanvas.width = portal.tileSize() * 5;

    cityPortal.setCenter(city.tile.x, city.tile.y);
    cityPortal.build(city.tiles);

    const yieldMap = cityPortal.getLayer(Yields) as Yields;
    yieldMap.render(city.tilesWorked);

    cityPortal.render();

    return h(s('<div class="city-map"></div>', portalCanvas), {
      click: () =>
        transport.send('action', {
          name: 'ReassignWorkers',
          city: city.id,
        }),
    });
  },
  yieldImages = (cityYield: Yield): Node[] =>
    new Array(Math.abs(cityYield.value)).fill(0).map(() => {
      const icon = s('<span class="yield-icon"></span>');

      assetStore
        .getScaled(`./assets/${knownIcons[knownGroups[cityYield._]]}`, 2)
        .then((image) =>
          icon.append(s(`<img src="${image.toDataURL('image/png')}">`))
        );

      return icon;
    }),
  renderBuildDetails = (
    city: CityData,
    chooseProduction: () => void,
    completeProduction: () => void
  ): HTMLElement => {
    const turnsLeft = buildTurns(city);

    return s(
      `<div class="build"><header>Building ${
        city.build.building ? city.build.building.item._ : 'nothing'
      }</header></div>`,
      h(s(`<button>${city.build.building ? 'Change' : 'Choose'}</button>`), {
        click() {
          chooseProduction();
        },
      }),
      h(s('<button>Buy</button>'), {
        click() {
          completeProduction();
        },
      }),
      city.build.building
        ? s(
            `<p>Progress ${city.build.progress.value} / ${
              city.build.cost.value
            } (${turnsLeft} turn${turnsLeft === 1 ? '' : 's'})</p>`
          )
        : ''
    );
  },
  renderGrowth = (city: CityData): Node => {
    const growth: CityGrowth = city.growth,
      turnsLeft = growthTurns(city);

    return s(
      `<div class="growth"><header>Growth</header><p>Size ${growth.size.toString()}</p><p>Progress ${
        city.growth.progress.value
      } / ${city.growth.cost.value} (${turnsLeft} turn${
        turnsLeft === 1 ? '' : 's'
      })</p></div>`
    );
  },
  renderImprovements = (city: CityData): Node => {
    return s(
      `<div class="improvements"></div>`,
      s(
        `<div></div>`,
        ...city.improvements.map((improvement) =>
          s(
            `<div>${improvement._}</div>`,
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
      s(
        `<div class="garrisoned-units"><header>Garrisoned Units</header></div>`,
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
      `<div class="supported-units"><header>Supported Units</header></div>`,
      s(
        '<div class="units"></div>',
        ...city.units.map((unit) =>
          s(
            '<span class="unit"></span>',
            new Unit(unit),
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
        canResize: true,
        canMaximise: true,
        size: 'maximised',
      }
    );

    setTimeout(() => resizeYields(this.element()), 200);

    this.addClass('city-screen-window');

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
        this.completeProduction();

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
