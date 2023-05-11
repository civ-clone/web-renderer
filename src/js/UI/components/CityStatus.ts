import { City as CityData, GameData, PlainObject, Player } from '../types';
import { knownIcons } from '../lib/yieldMap';
import { turnsLeft, turnsText, yieldData } from './lib/cityYields';
import City from './City';
import DataObserver from '../DataObserver';
import Portal from './Portal';
import Transport from '../Transport';
import Window from './Window';
import { assetStore } from '../AssetStore';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { getLabelForBuildable } from './lib/cityBuild';
import { cityName } from './lib/city';

const buildCityRow = async (city: CityData): Promise<HTMLElement[]> => {
  const [food, production, trade, research, gold, luxuries] = [
      'Food',
      'Production',
      'Trade',
      'Research',
      'Gold',
      'Luxuries',
    ].map((yieldName) => yieldData(city, yieldName)),
    [
      foodIcon,
      productionIcon,
      tradeIcon,
      researchIcon,
      goldIcon,
      luxuriesIcon,
    ] = await Promise.all(
      ['Food', 'Production', 'Trade', 'Research', 'Gold', 'Luxuries'].map(
        (yieldName) =>
          assetStore
            .getScaled(`./assets/${knownIcons[yieldName]}`, 2)
            .then((image) => `<img src="${image.toDataURL('image/png')}">`)
      )
    );

  return [
    s(`<header>${cityName(city)}</header>`),
    s(
      `<div class="growth"><strong>${t(
        'City.size',
        city.growth
      )}</strong> ${foodIcon} ${t('CityStatus.growth', {
        free: food[2],
        total: food[0],
        totals_context: food[0] === food[2] ? 'equal' : 'unequal',
        turns: turnsLeft(city.growth, city.yields, 'Food'),
      })}</div>`
    ),
    s(
      `<div class="build">${productionIcon}  ${t('CityStatus.build', {
        free: production[2],
        total: production[0],
        context: city.build.building ? 'nonempty' : 'empty',
        totals_context: production[0] === production[2] ? 'equal' : 'unequal',
        buildable: getLabelForBuildable(city.build.building),
        build: city.build,
        turns: city.build.building
          ? turnsLeft(city.build, city.yields, 'Production')
          : Infinity,
      })}</div>`
    ),
    s(
      `<div class="yields">${(
        [
          [trade, tradeIcon],
          [research, researchIcon],
          [gold, goldIcon],
          [luxuries, luxuriesIcon],
        ] as [[number, number, number], string][]
      )
        .filter(([[total]]) => total !== 0)
        .map(
          ([[total, , free], icon]) =>
            `${icon} ${t('CityStatus.totals', {
              free,
              total,
              context: free === total ? 'equal' : 'unequal',
            })}`
        )
        .join(', ')}</div>`
    ),
  ];
};

export class CityStatus extends Window {
  #cities: CityData[];
  #dataObserver: DataObserver;
  #portal: Portal;
  #transport: Transport;

  constructor(player: Player, portal: Portal, transport: Transport) {
    super(t('CityStatus.title'), s('<div class="loading"></div>'), {
      classes: 'city-status',
    });

    this.#cities = player.cities;
    this.#dataObserver = new DataObserver(
      [
        player.id,
        ...player.cities.flatMap(({ id, build, growth }: CityData) => [
          id,
          growth.id,
          build.id,
        ]),
      ],
      (data) => {
        const player = (data as GameData).player;

        this.#cities = player.cities;

        this.#dataObserver.setIds([
          player.id,
          ...player.cities.flatMap(({ id, build, growth }: CityData) => [
            id,
            growth.id,
            build.id,
          ]),
        ]);

        this.update();
      }
    );
    this.#portal = portal;
    this.#transport = transport;

    this.update();
  }

  close() {
    this.#dataObserver.dispose();

    return super.close();
  }

  update() {
    Promise.all(this.#cities.map((city) => buildCityRow(city))).then((rows) =>
      super.update(
        s(
          '<table></table>',
          ...rows.map(([name, growth, build, yields], index) => {
            const row = document.createElement('tr');

            row.append(
              ...(
                [
                  [name, 'th'],
                  [growth, 'td'],
                  [build, 'td'],
                  [yields, 'td'],
                ] as [HTMLElement, string][]
              ).map(([element, containerNodeName]) => {
                const container = document.createElement(containerNodeName);

                container.append(element);

                return container;
              })
            );

            return h(row, {
              click: () =>
                new City(this.#cities[index], this.#portal, this.#transport),
            });
          })
        )
      )
    );
  }
}

export default CityStatus;
