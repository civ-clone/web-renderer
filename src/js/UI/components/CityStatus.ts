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
    s(`<header>${city.name}</header>`),
    s(
      `<div class="growth"><strong>${city.growth.size}</strong> ${foodIcon} ${
        food[2]
      } [${food[0]}] (${turnsText(
        turnsLeft(city.growth, city.yields, 'Food')
      )})</div>`
    ),
    s(
      `<div class="build">${productionIcon} ${production[2]} [${
        production[0]
      }] ${city.build.building ? city.build.building.item._ : 'Nothing'}${
        city.build.building
          ? ` (${turnsText(turnsLeft(city.build, city.yields, 'Production'))})`
          : ''
      }</div>`
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
            `${icon} ${free}${free !== total ? ` [${total}]` : ''}`
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
    super('City details', s('<div class="loading"></div>'), {
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
