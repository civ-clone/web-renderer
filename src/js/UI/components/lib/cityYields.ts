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
import { citizenState } from '../../lib/citizenState';
import { orderSpecialists } from '../../lib/specialists';
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
 * The city's citizens as Civ1 shows them: the happy, content and unhappy workers, then the specialists. The workers'
 * moods come from `citizenState`, the engine's own order, so the faces drawn are the ones that decide disorder.
 */
export const renderPopulation = (
  city: CityData,
  yields: Yield[] = city.yields,
  onSpecialistClick?: (specialist: Specialist) => void
): Node => {
  const specialists = orderSpecialists(city.specialists ?? []),
    [happiness, unhappiness] = reduceKnownYields(
      yields,
      'Happiness',
      'Unhappiness'
    ),
    state = citizenState(
      city.growth.size,
      happiness,
      unhappiness,
      specialists.length
    );

  return drawCitizens(state, specialists, city.name, onSpecialistClick);
};

// Which citizens are drawn as women and which as men: a pattern taken from `seed` (a city's name), so the same city
//  always looks the same.
const citizenMask = (seed: string): string =>
  (parseInt(seed.replace(/[^a-z]/gi, ''), 36) || 0).toString(2);

// Draws the workers (`state` holds 0 for unhappy, 1 for content and 2 for happy) and then the specialists.
const drawCitizens = <SpecialistType extends { _: string }>(
  state: number[],
  specialists: SpecialistType[],
  seed: string,
  onSpecialistClick?: (specialist: SpecialistType) => void
): HTMLElement => {
  const mask = citizenMask(seed),
    population = s('<div class="population"></div>');

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

/**
 * Citizens from counts rather than a city's yields, for a report that is sent the counts (the Top Cities report, #124):
 * the happy, content and unhappy workers, then the specialists.
 */
export const renderCitizenCounts = (
  {
    happy,
    content,
    unhappy,
    specialists,
  }: { happy: number; content: number; unhappy: number; specialists: string[] },
  seed: string
): HTMLElement =>
  drawCitizens(
    [
      ...new Array(happy).fill(2),
      ...new Array(content).fill(1),
      ...new Array(unhappy).fill(0),
    ],
    orderSpecialists(specialists.map((specialist) => ({ _: specialist }))),
    seed
  );

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
