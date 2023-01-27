import {
  City as CityData,
  CityImprovementMaintenanceGold,
  GameData,
  PlainObject,
  Player,
} from '../types';
import { knownIcons, reduceKnownYield } from '../lib/yieldMap';
import { turnsLeft, turnsText, yieldData } from './lib/cityYields';
import City from './City';
import DataObserver from '../DataObserver';
import Portal from './Portal';
import Transport from '../../Engine/Transport';
import Window from './Window';
import { assetStore } from '../AssetStore';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { instance as localeProvider } from '../LocaleProvider';

export class TradeReport extends Window {
  #cities: CityData[];
  #dataObserver: DataObserver;
  #portal: Portal;
  #transport: Transport;

  constructor(player: Player, portal: Portal, transport: Transport) {
    super('Trade report', s('<div class="loading"></div>'), {
      classes: 'trade-report',
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

  async update() {
    const goldIcon = await assetStore
        .getScaled(`./assets/${knownIcons.Gold}`, 2)
        .then((image) => `<img src="${image.toDataURL('image/png')}">`),
      cityList = s(`<table class="city-list"></table>`),
      improvementList = s(`<table class="improvement-list"></table>`),
      improvements: {
        [key: string]: {
          count: number;
          cost: number;
        };
      } = {},
      [totalIncome, totalSpend, totalGold] = this.#cities.reduce(
        ([totalIncome, totalSpend, totalGold], city: CityData) => {
          city.yields.forEach((cityYield) => {
            if (cityYield._ === 'CityImprovementMaintenanceGold') {
              const improvement = (cityYield as CityImprovementMaintenanceGold)
                .cityImprovement;

              if (!(improvement._ in improvements)) {
                improvements[improvement._] = {
                  count: 0,
                  cost: cityYield.value,
                };
              }

              improvements[improvement._].count++;
            }
          });

          const [cityGold, used, free] = yieldData(city, 'Gold'),
            row = document.createElement('tr');

          h(row, {
            click: () => new City(city, this.#portal, this.#transport),
          });

          row.append(
            ...[
              city.name,
              `${goldIcon} ${free}${free !== cityGold ? ` [${cityGold}]` : ''}`,
            ].map((content) => {
              const element = document.createElement('td');

              element.innerHTML = content;

              return element;
            })
          );

          cityList.append(row);

          return [totalIncome + cityGold, totalSpend + used, totalGold + free];
        },
        [0, 0, 0]
      );

    improvementList.append(
      ...Object.entries(improvements).map(([name, { count, cost }]) => {
        const row = document.createElement('tr');

        row.append(
          ...[`${count} &times; ${name}`, `${goldIcon} ${count * -cost}`].map(
            (content) => {
              const element = document.createElement('td');

              element.innerHTML = content;

              return element;
            }
          )
        );

        return row;
      })
    );

    super.update(
      s(
        '<div></div>',
        s(
          `<div class="two-column-wrapper"></div>`,
          s('<div></div>', cityList),
          s(
            '<div></div>',
            improvementList,
            s(`    <dl class="totals">
      <dt>Total income</dt>
      <dd>${goldIcon} ${localeProvider.number(totalIncome)} / turn</dd>
      <dt>Total cost</dt>
      <dd>${goldIcon} ${localeProvider.number(Math.abs(totalSpend))} / turn</dd>
      <dt>Total surplus</dt>
      <dd>${goldIcon} ${localeProvider.number(totalGold)} / turn</dd>
    </dl>
`)
          )
        )
      )
    );
  }
}

export default TradeReport;
