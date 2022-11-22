import {
  City as CityData,
  City,
  CityBuild,
  CityGrowth,
  PlayerResearch,
  Yield,
} from '../../types';
import {
  knownGroupLookup,
  knownGroups,
  knownIcons,
  reduceKnownYield,
  reduceKnownYields,
} from '../../lib/yieldMap';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element/src/Element';

export const buildTurns = (city: City) =>
  turnsLeft(city.build, city.yields, 'Production');

export const growthTurns = (city: City) =>
  turnsLeft(city.growth, city.yields, 'Food');

export const renderPopulation = (city: CityData): Node => {
  const growth = city.growth,
    mask = parseInt(city.name.replace(/[^a-z]/gi, ''), 36).toString(2),
    state = new Array(growth.size).fill(1),
    population = s('<div class="population"></div>');

  let [happiness, unhappiness] = reduceKnownYields(
      city.yields,
      'Happiness',
      'Unhappiness'
    ),
    currentIndex = state.length - 1;

  while (unhappiness > 0 && currentIndex > -1) {
    state[currentIndex--] = 0;
    unhappiness--;
  }

  currentIndex = 0;

  while (happiness > 0 && currentIndex < state.length) {
    if (state[currentIndex] === 0) {
      state[currentIndex]++;
      happiness--;
    }

    if (state[currentIndex] === 1) {
      state[currentIndex++]++;
      happiness--;
    }

    if (state[currentIndex] === 2) {
      currentIndex++;
    }
  }

  state.forEach((status, index) =>
    assetStore
      .getScaled(
        `./assets/city/people_${['unhappy', 'content', 'happy'][status]}_${
          ['f', 'm'][parseInt(mask[index % mask.length], 10)]
        }.png`,
        2
      )
      .then((image) =>
        population.append(
          s(
            '<span class="citizen"></span>',
            s(`<img src="${image.toDataURL('image/png')}">`)
          )
        )
      )
  );

  return population;
};

export const renderProgress = (
  cityData: CityGrowth | CityBuild | PlayerResearch,
  yields: Yield[],
  yieldName: string
) =>
  `Progress ${cityData.progress.value} / ${cityData.cost.value} (${turnsText(
    turnsLeft(cityData, yields, yieldName)
  )})`;

export const turnsLeft = (
  data: CityGrowth | CityBuild | PlayerResearch,
  yields: Yield[],
  yieldName: string
) =>
  Math.max(
    1,
    Math.ceil(
      (data.cost.value - data.progress.value) /
        reduceKnownYield(yields, yieldName)
    )
  );

export const turnsText = (turns: number) =>
  turns + ' turn' + (turns === 1 ? '' : 's');

export const yieldData = (city: CityData, yieldName: string) =>
  city.yields.reduce(
    ([total, used, free], cityYield) => {
      const isKnown = knownGroupLookup[yieldName]?.includes(cityYield._);

      if (isKnown && cityYield.value > 0) {
        total += cityYield.value;
      }

      if (isKnown && cityYield.value < 0) {
        used += cityYield.value;
      }

      if (isKnown) {
        free += cityYield.value;
      }

      return [total, used, free];
    },
    [0, 0, 0]
  );

export const yieldImages = (cityYield: { _: string; value: number }): Node[] =>
  new Array(Math.abs(cityYield.value)).fill(0).map(() => {
    const icon = s('<span class="yield-icon"></span>');

    assetStore
      .getScaled(`./assets/${knownIcons[knownGroups[cityYield._]]}`, 2)
      .then((image) =>
        icon.append(s(`<img src="${image.toDataURL('image/png')}">`))
      );

    return icon;
  });
