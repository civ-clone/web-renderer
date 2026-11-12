import { Yield } from '@civ-clone/ui-protocol/types';
import instanceOf from './instanceOf';

/**
 * The group a yield is totalled and drawn with. The engine sends each yield's class ancestry (`__`, from core-data-object's
 * `generateInheritance`), so the group is the entry just before `Yield`, and a yield the UI has never heard of still lands
 * in its group. Without that ancestry (the `{ _: group, value }` objects drawn for a group) the group is the yield itself.
 */
export const yieldGroup = (cityYield: { _: string; __?: string[] }): string => {
  const index = cityYield.__?.indexOf('Yield') ?? -1;

  return index > 0 ? cityYield.__![index - 1]! : cityYield._;
};

export const reduceKnownYields = <Names extends string[]>(
  yields: Yield[],
  ...yieldNames: Names
): { [index in keyof Names]: number } =>
  // One total for each name.
  yields.reduce(
    (yields, cityYield) => {
      yieldNames.forEach((yieldName, index) => {
        if (instanceOf(cityYield, yieldName)) {
          yields[index]! += cityYield.value;
        }
      });

      return yields;
    },
    yieldNames.map(() => 0)
  ) as { [index in keyof Names]: number };

export const reduceKnownYield = (yields: Yield[], yieldName: string): number =>
  reduceKnownYields(yields, yieldName)[0];

/**
 * A square's yields as one entry each, in whole icons, leaving out any that come to nothing. A square can have several
 * entries for one yield, some negative (Pollution halves Food with a negative Food, #32), so the icons drawn are what
 * each nets to.
 */
export const netTileYields = (
  yields: Pick<Yield<string>, '_' | 'value'>[]
): { _: string; value: number }[] =>
  Object.entries(
    yields.reduce((netYields, tileYield) => {
      netYields[tileYield._] = (netYields[tileYield._] ?? 0) + tileYield.value;

      return netYields;
    }, {} as { [key: string]: number })
  )
    .map(([_, value]) => ({ _, value: Math.floor(value) }))
    .filter(({ value }) => value > 0);

/**
 * A square's yield icons in a grid: two rows, with more columns the more icons there are, each icon's column and row.
 * A square with more icons than the widest layout has room for has as many as fit.
 */
export const tileYieldGrid = (
  yields: Pick<Yield<string>, '_' | 'value'>[]
): { columns: number; icons: { _: string; column: number; row: number }[] } => {
  const icons = netTileYields(yields)
      // TODO: use a more effective sort than this, this only works by luck (Food -> Production -> Trade)
      .sort((a, b) => a._.charCodeAt(0) - b._.charCodeAt(0))
      .flatMap(({ _, value }) => Array.from({ length: value }, () => _)),
    columns = Math.min(6, Math.max(2, Math.ceil(icons.length / 2)));

  return {
    columns,
    icons: icons.slice(0, columns * 2).map((_, index) => ({
      _,
      column: index % columns,
      row: Math.floor(index / columns),
    })),
  };
};

/**
 * Where each of a square's yield icons goes, as a fraction of the square: `tileYieldGrid`'s columns across it, and its
 * two rows down it.
 */
export const tileYieldIcons = (
  yields: Pick<Yield<string>, '_' | 'value'>[]
): { _: string; x: number; y: number }[] => {
  const { columns, icons } = tileYieldGrid(yields);

  return icons.map(({ _, column, row }) => ({
    _,
    x: column / columns,
    y: row / 2,
  }));
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
