import {
  City as CityData,
  CityImprovementContent,
  GameData,
  MartialLaw,
  MilitaryUnhappiness,
  Player,
} from '../types';
import { knownIcons, reduceKnownYield } from '../lib/yieldMap';
import City from './City';
import DataObserver from '../DataObserver';
import Element from '@dom111/element';
import Portal from './Portal';
import SupportedUnit from './SupportedUnit';
import Transport from '../Transport';
import Unit from './Unit';
import Window from './Window';
import { assetStore } from '../AssetStore';
import { cityName } from './lib/city';
import { h } from '../lib/html';
import { instance as localeProvider } from '../LocaleProvider';
import instanceOf from '../lib/instanceOf';
import { renderPopulation } from './lib/cityYields';
import { s } from '@dom111/element';
import { t } from 'i18next';

const buildCityRow = async (
  city: CityData,
  portal: Portal,
  transport: Transport
) => {
  const happinessReasons: {
    [key: string]: (cityYield: any) => string | HTMLElement | Element;
  } = {
    CityImprovementContent: (cityYield: CityImprovementContent) =>
      cityYield.cityImprovement._,
    MartialLaw: (cityYield: MartialLaw) => new Unit(cityYield.unit),
    MilitaryUnhappiness: (cityYield: MilitaryUnhappiness) =>
      new SupportedUnit(city, cityYield.unit, ['MilitaryUnhappiness']),
    LuxuryHappiness: () => {
      const luxuriesElement = s(`<span></span>`);

      assetStore
        .getScaled(`./assets/${knownIcons.Luxuries}`, 2)
        .then((image) =>
          luxuriesElement.append(
            s(`<img src="${image.toDataURL('image/png')}">`),
            localeProvider.number(reduceKnownYield(city.yields, 'Luxuries'))
          )
        );

      return luxuriesElement;
    },
  };

  const happinessYields = city.yields.filter(
      (cityYield) =>
        instanceOf(cityYield, 'Happiness', 'Unhappiness') &&
        cityYield.value !== 0
    ),
    reasons = happinessYields.map((cityYield, index) =>
      s(
        `<div class="reason"></div>`,
        renderPopulation(city, happinessYields.slice(0, index + 1)),
        s(
          `<div class="detail"></div>`,
          happinessReasons[cityYield._]
            ? happinessReasons[cityYield._](cityYield)
            : cityYield._
        )
      )
    );

  const reasonWrapper = s('<div class="reasons hidden"></div>', ...reasons);

  return h(
    s(
      `<div class="city${city.celebrateLeader ? ' celebrateLeader' : ''}${
        city.civilDisorder ? ' civilDisorder' : ''
      }"><div class="name">${cityName(city)}</div></div>`,
      renderPopulation(city),
      h(
        s(
          `<button>${t('HappinessReport.view-city', {
            cityName: cityName(city),
          })}</button>`
        ),
        {
          click(event: MouseEvent) {
            event.stopPropagation();

            new City(city, portal, transport);
          },
        }
      ),
      reasonWrapper
    ),
    {
      click() {
        if (reasons.length === 0) {
          return;
        }

        reasonWrapper.classList.toggle('hidden');
      },
    }
  );
};

export class HappinessReport extends Window {
  #dataObserver: DataObserver;
  #player: Player;
  #portal: Portal;
  #transport: Transport;

  constructor(player: Player, portal: Portal, transport: Transport) {
    super('Happiness report', s('<div></div>'), {
      classes: 'happiness-report',
    });

    this.element().setAttribute(
      'data-i18n-breakdown',
      t('HappinessReport.breakdown')
    );

    this.#dataObserver = new DataObserver(
      [player.id, ...player.cities.map((city) => city.id)],
      (data) => {
        this.#player = (data as GameData).player;

        this.#dataObserver.setIds([
          player.id,
          ...player.cities.map((city) => city.id),
        ]);

        this.update();
      }
    );

    this.#player = player;
    this.#portal = portal;
    this.#transport = transport;

    this.update();
  }

  close() {
    this.#dataObserver.dispose();

    return super.close();
  }

  update() {
    Promise.all(
      this.#player.cities.map((city) =>
        buildCityRow(city, this.#portal, this.#transport)
      )
    ).then((rows) => super.update(s('<div></div>', ...rows)));
  }
}

export default HappinessReport;
