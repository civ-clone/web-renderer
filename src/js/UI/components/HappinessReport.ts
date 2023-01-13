import {
  City,
  CityImprovementContent,
  GameData,
  MartialLaw,
  MilitaryUnhappiness,
  Player,
  Yield,
} from '../types';
import Window from './Window';
import { s } from '@dom111/element';
import { renderPopulation } from './lib/cityYields';
import Unit from './Unit';
import { SupportedUnit } from './SupportedUnit';
import Element from '@dom111/element';
import DataObserver from '../DataObserver';

const buildCityRow = async (city: City) => {
  const happinessReasons: {
    [key: string]: (cityYield: any) => string | HTMLElement | Element;
  } = {
    CityImprovementContent: (cityYield: CityImprovementContent) =>
      cityYield.cityImprovement._,
    MartialLaw: (cityYield: MartialLaw) => new Unit(cityYield.unit),
    MilitaryUnhappiness: (cityYield: MilitaryUnhappiness) =>
      new SupportedUnit(city, cityYield.unit, ['MilitaryUnhappiness']),
  };

  const reasons = city.yields.reduce(
    (reasons: (string | HTMLElement | Element)[], cityYield) => {
      if (cityYield._ in happinessReasons) {
        reasons.push(happinessReasons[cityYield._](cityYield));
      }

      return reasons;
    },
    []
  );

  return s(
    `<div class="city"><div class="name">${city.name}</div></div>`,
    renderPopulation(city),
    s('<div class="reasons"></div>', ...reasons)
  );
};

export class HappinessReport extends Window {
  #dataObserver: DataObserver;
  #player: Player;

  constructor(player: Player) {
    super('Happiness report', s('<div></div>'), {
      classes: 'happiness-report',
    });

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

    this.update();
  }

  close() {
    this.#dataObserver.dispose();

    return super.close();
  }

  update() {
    Promise.all(this.#player.cities.map((city) => buildCityRow(city))).then(
      (rows) => super.update(s('<div></div>', ...rows))
    );
  }
}

export default HappinessReport;
