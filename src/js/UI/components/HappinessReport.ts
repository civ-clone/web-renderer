import {
  City as CityData,
  CityImprovementContent,
  MartialLaw,
  MilitaryUnhappiness,
  Player,
} from '../types';
import { groupIcons, reduceKnownYield } from '../lib/yieldMap';
import Element from '@dom111/element';
import Portal from './Portal';
import SupportedUnit from './SupportedUnit';
import Transport from '../Transport';
import Unit from './Unit';
import FilterableWindow from './FilterableWindow';
import { assetStore } from '../AssetStore';
import { cityName } from './lib/city';
import { getLabelForBuildableEntity } from './lib/cityBuild';
import { h } from '../lib/html';
import { instance as localeProvider } from '../LocaleProvider';
import { renderPopulation } from './lib/cityYields';
import { s } from '@dom111/element';
import { t } from 'i18next';
import watchPlayer, { cityIds } from './lib/watchPlayer';

const buildCityRow = async (
  city: CityData,
  portal: Portal,
  transport: Transport
) => {
  const happinessReasons: {
    [key: string]: (cityYield: any) => string | HTMLElement | Element;
  } = {
    CityImprovementContent: (cityYield: CityImprovementContent) =>
      getLabelForBuildableEntity(cityYield.cityImprovement),
    MartialLaw: (cityYield: MartialLaw) => new Unit(cityYield.unit),
    MilitaryUnhappiness: (cityYield: MilitaryUnhappiness) =>
      new SupportedUnit(city, cityYield.unit, ['MilitaryUnhappiness']),
    LuxuryHappiness: () => {
      const luxuriesElement = s(`<span></span>`);

      assetStore
        .getScaled(`./assets/${groupIcons.Luxuries}`, 2)
        .then((image) =>
          luxuriesElement.append(
            s(`<img src="${image.toDataURL('image/png')}">`),
            localeProvider.number(reduceKnownYield(city.yields, 'Luxuries'))
          )
        );

      return luxuriesElement;
    },
  };

  const reasons = (city.citizens?.causes ?? []).map((cause) =>
    s(
      `<div class="reason"></div>`,
      renderPopulation(city, cause.moods),
      s(
        `<div class="detail"></div>`,
        happinessReasons[cause.yield._]
          ? happinessReasons[cause.yield._](cause.yield)
          : cause.yield._
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
            city,
          })}</button>`
        ),
        {
          click(event: MouseEvent) {
            event.stopPropagation();

            portal.openCity(city);
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

export class HappinessReport extends FilterableWindow {
  #player: Player;
  #portal: Portal;
  #transport: Transport;
  #unwatch: () => void;

  constructor(player: Player, portal: Portal, transport: Transport) {
    super(t('HappinessReport.title'), s('<div></div>'), {
      classes: 'happiness-report',
      rowSelector: '.city',
    });

    this.element().setAttribute(
      'data-i18n-breakdown',
      t('HappinessReport.breakdown')
    );

    this.#unwatch = watchPlayer(player, cityIds, (player) => {
      this.#player = player;

      this.update();
    });

    this.#player = player;
    this.#portal = portal;
    this.#transport = transport;

    this.update();
  }

  close() {
    this.#unwatch();

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
