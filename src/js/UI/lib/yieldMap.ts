import { City } from '../types';

export const knownGroups: { [key: string]: string } = {
  Food: 'Food',
  UnitSupportFood: 'Food',
  PopulationSupportFood: 'Food',
  Production: 'Production',
  UnitSupportProduction: 'Production',
  Trade: 'Trade',
  Corruption: 'Trade',
  Happiness: 'Happiness',
  LuxuryHappiness: 'Happiness',
  Unhappiness: 'Unhappiness',
  MartialLaw: 'Unhappiness',
  MilitaryUnhappiness: 'Unhappiness',
  PopulationUnhappiness: 'Unhappiness',
  CityImprovementContent: 'Unhappiness',
  Research: 'Research',
  Luxuries: 'Luxuries',
  Gold: 'Gold',
  CityImprovementMaintenanceGold: 'Gold',
};

export const knownGroupLookup = Object.entries(knownGroups).reduce(
  (object, [yieldName, group]) => {
    if (!Object.prototype.hasOwnProperty.call(object, group)) {
      object[group] = [];
    }

    if (!Object.prototype.hasOwnProperty.call(object, yieldName)) {
      object[yieldName] = [];
    }

    object[group].push(yieldName);
    object[yieldName].push(yieldName);

    return object;
  },
  {} as { [key: string]: string[] }
);

export const reduceKnownYields = (
  city: City,
  ...yieldNames: string[]
): number[] =>
  city.yields.reduce(
    (yields, cityYield, index) => {
      yieldNames.forEach((yieldName, index) => {
        if (knownGroupLookup[yieldName]?.includes(cityYield._)) {
          yields[index] += cityYield.value;
        }
      });

      return yields;
    },
    yieldNames.map(() => 0)
  );

export const reduceKnownYield = (city: City, yieldName: string): number =>
  reduceKnownYields(city, yieldName)[0];

export const knownIcons: { [key: string]: string } = {
  Food: 'city/food.png',
  Production: 'city/production.png',
  Trade: 'city/trade.png',
  Gold: 'city/gold.png',
  Luxuries: 'city/luxury.png',
  Pollution: 'city/pollution.png',
  Research: 'city/bulb.png',
  Unhappiness: 'city/sad.png',
};
