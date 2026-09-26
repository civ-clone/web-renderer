import {
  City as CityData,
  City,
  CityBuild,
  CityGrowth,
  PlayerResearch,
  Specialist,
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
import { s } from '@dom111/element';
import { t } from 'i18next';

export const buildTurns = (city: City) =>
  turnsLeft(city.build, city.yields, 'Production');

export const growthTurns = (city: City) =>
  turnsLeft(city.growth, city.yields, 'Food');

const specialistIcons: { [key: string]: string } = {
  Entertainer: 'luxury',
  TaxCollector: 'tax',
  Scientist: 'science',
};

const renderCitizen = (path: string, title?: string): HTMLElement => {
  const citizen = s('<span class="citizen"></span>');

  if (title) {
    citizen.setAttribute('title', title);
  }

  assetStore
    .getScaled(path, 2)
    .then((image) =>
      citizen.append(s(`<img src="${image.toDataURL('image/png')}">`))
    );

  return citizen;
};

/**
 * The city's citizens as Civ1 shows them: the happy, content and unhappy workers, then the specialists. Specialists are
 * drawn from the content citizens first, then from the happy ones, as the engine counts them.
 */
export const renderPopulation = (
  city: CityData,
  yields: Yield[] = city.yields,
  onSpecialistClick?: (specialist: Specialist) => void
): Node => {
  const growth = city.growth,
    mask = parseInt(city.name.replace(/[^a-z]/gi, ''), 36).toString(2),
    state = new Array(growth.size).fill(1),
    specialists = [...(city.specialists ?? [])].sort(
      (a, b) =>
        Object.keys(specialistIcons).indexOf(a._) -
        Object.keys(specialistIcons).indexOf(b._)
    ),
    population = s('<div class="population"></div>');

  let [happiness, unhappiness] = reduceKnownYields(
      yields,
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

  let toRemove = specialists.length;

  [1, 2, 0].forEach((status) => {
    while (toRemove > 0 && state.includes(status)) {
      state.splice(state.lastIndexOf(status), 1);
      toRemove--;
    }
  });

  state.forEach((status, index) =>
    population.append(
      renderCitizen(
        `./assets/city/people_${['unhappy', 'content', 'happy'][status]}_${
          ['f', 'm'][parseInt(mask[index % mask.length], 10)]
        }.png`
      )
    )
  );

  specialists.forEach((specialist) => {
    const citizen = renderCitizen(
      `./assets/city/people_${specialistIcons[specialist._] ?? 'luxury'}.png`,
      t(`City.Specialist.${specialist._}`)
    );

    citizen.classList.add('specialist');

    if (onSpecialistClick) {
      // Only interactive where there is a handler: the Happiness report shows specialists but cannot change them.
      citizen.classList.add('clickable');
      citizen.setAttribute('role', 'button');
      citizen.setAttribute('tabindex', '0');
      citizen.setAttribute(
        'aria-label',
        t('City.Specialist.change', {
          specialist: t(`City.Specialist.${specialist._}`),
        })
      );

      citizen.addEventListener('click', (event) => {
        event.stopPropagation();

        onSpecialistClick(specialist);
      });

      citizen.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        onSpecialistClick(specialist);
      });
    }

    population.append(citizen);
  });

  return population;
};

export const renderProgress = (
  cityData: CityGrowth | CityBuild | PlayerResearch,
  yields: Yield[],
  yieldName: string
) =>
  t('Progress.body', {
    progress: cityData.progress.value,
    total: cityData.cost.value,
    turns: turnsLeft(cityData, yields, yieldName),
  });

export const turnsLeft = (
  data: CityGrowth | CityBuild | PlayerResearch,
  yields: Yield[],
  yieldName: string
) => {
  const remainingTurns = Math.max(
    1,
    Math.ceil(
      (data.cost.value - data.progress.value) /
        Math.abs(reduceKnownYield(yields, yieldName))
    )
  );

  // Return 0 so that it can be handled as a plural in the translations as `Never`, rather than `Infinity turns`.
  return Number.isFinite(remainingTurns) ? remainingTurns : 0;
};
export const turnsText = (turns: number) =>
  t('Progress.turns', { count: turns });

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

export const yieldImages = (
  cityYield: { _: string; value: number },
  absolute: boolean = false
): Node[] =>
  new Array(
    Math.trunc(
      absolute ? Math.abs(cityYield.value) : Math.max(0, cityYield.value)
    )
  )
    .fill(0)
    .map(() => {
      const icon = s('<span class="yield-icon"></span>');

      assetStore
        .getScaled(`./assets/${knownIcons[knownGroups[cityYield._]]}`, 2)
        .then((image) =>
          icon.append(s(`<img src="${image.toDataURL('image/png')}">`))
        );

      return icon;
    });

export const yieldLabel = (cityYield: Yield) =>
  t(`${cityYield._}.name`, {
    defaultValue: cityYield._,
    ns: 'yield',
  });
