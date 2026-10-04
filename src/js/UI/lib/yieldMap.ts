import { Yield } from '../types';
import instanceOf from './instanceOf';

/**
 * The group a yield is totalled and drawn with. The engine sends each yield's class ancestry (`__`, from core-data-object's
 * `generateInheritance`), so the group is the entry just before `Yield`, and a yield the UI has never heard of still lands
 * in its group. Without that ancestry (the `{ _: group, value }` objects drawn for a group) the group is the yield itself.
 */
export const yieldGroup = (cityYield: { _: string; __?: string[] }): string => {
  const index = cityYield.__?.indexOf('Yield') ?? -1;

  return index > 0 ? cityYield.__![index - 1] : cityYield._;
};

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

export const groupIcons: { [key: string]: string } = {
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
    .filter((cityYield) => yieldGroup(cityYield) === group)
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
