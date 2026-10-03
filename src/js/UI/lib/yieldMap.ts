import { Yield } from '../types';
import instanceOf from './instanceOf';

export const knownGroupParents: string[] = [
  'Food',
  'Production',
  'Trade',
  'Gold',
  'Research',
  'Happiness',
  'Unhappiness',
];
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
  yields: Yield[],
  ...yieldNames: string[]
): number[] =>
  yields.reduce(
    (yields, cityYield) => {
      yieldNames.forEach((yieldName, index) => {
        if (instanceOf(cityYield, yieldName)) {
          yields[index] += cityYield.value;
        }
      });

      return yields;
    },
    yieldNames.map(() => 0)
  );

export const reduceKnownYield = (yields: Yield[], yieldName: string): number =>
  reduceKnownYields(yields, yieldName)[0];

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

/**
 * How a city's yield is drawn on the city screen: what it makes and uses (`used`), what it uses but doesn't make
 * (`deficit`), and what is left over (`free`).
 */
export const splitYield = (
  group: string,
  yields: Yield[]
): { used: number; deficit: number; free: number } => {
  const [produced, consumed] = yields
    .filter((cityYield) => knownGroupLookup[group]?.includes(cityYield._))
    .reduce(
      ([produced, consumed], cityYield) =>
        cityYield.value < 0
          ? [produced, consumed - cityYield.value]
          : [produced + cityYield.value, consumed],
      [0, 0]
    );

  return {
    used: Math.min(produced, consumed),
    deficit: Math.max(0, consumed - produced),
    free: Math.max(0, produced - consumed),
  };
};
