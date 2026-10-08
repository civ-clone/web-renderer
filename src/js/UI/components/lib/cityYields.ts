import {
  City as CityData,
  City,
  CitizenMood,
  CityBuild,
  CityGrowth,
  PlayerResearch,
  Specialist,
  Yield,
} from '../../types';
import { groupIcons, reduceKnownYield, yieldGroup } from '../../lib/yieldMap';
import { assetStore } from '../../AssetStore';
import {
  citizenMoods,
  citizenSprites,
  citizenSummary,
  specialistSprites,
} from '../../lib/citizens';
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

// Draws the first of `paths` that has been imported.
const renderCitizen = (paths: string[], title?: string): HTMLElement => {
  const citizen = s('<span class="citizen"></span>');

  if (title) {
    citizen.setAttribute('title', title);
  }

  assetStore
    .firstImported(paths)
    .then((path) => assetStore.getScaled(path, 2))
    .then((image) =>
      // Decorative: the population as a whole is summarised in words (#272).
      citizen.append(s(`<img src="${image.toDataURL('image/png')}" alt="">`))
    );

  return citizen;
};

/**
 * The city's citizens as Civ1 shows them: the happy, content and unhappy workers, then the specialists. The moods come
 * from the engine (civ1-city-happiness's `citizens` data), so the renderer doesn't know the rule that decides them.
 */
export const renderPopulation = (
  city: CityData,
  moods: CitizenMood[] = citizenMoods(city),
  onSpecialistClick?: (specialist: Specialist) => void
): Node =>
  drawCitizens(
    moods,
    orderSpecialists(city.specialists ?? []),
    city.name,
    onSpecialistClick
  );

// Draws the workers, one citizen per mood, and then the specialists.
const drawCitizens = <SpecialistType extends { _: string }>(
  moods: CitizenMood[],
  specialists: SpecialistType[],
  seed: string,
  onSpecialistClick?: (specialist: SpecialistType) => void
): HTMLElement => {
  const population = s('<div class="population"></div>'),
    summary = citizenSummary(
      moods,
      specialists.map(({ _ }) => _)
    );

  // The faces mean nothing to a screen reader, so the population is also said in words (#272). Where the specialists
  //  are buttons, an image role would hide them, so the words are text that's only hidden from view.
  if (onSpecialistClick) {
    population.append(s(`<span class="visually-hidden"></span>`, summary));
  } else {
    population.setAttribute('role', 'img');
    population.setAttribute('aria-label', summary);
  }

  citizenSprites(moods, seed).forEach((path) =>
    population.append(renderCitizen([path]))
  );

  const sprites = specialistSprites(
    specialists.map(({ _ }) => specialistIcons[_] ?? 'luxury'),
    moods.length,
    seed
  );

  specialists.forEach((specialist, index) => {
    const citizen = renderCitizen(
      sprites[index],
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
      ...new Array<CitizenMood>(happy).fill('happy'),
      ...new Array<CitizenMood>(content).fill('content'),
      ...new Array<CitizenMood>(unhappy).fill('unhappy'),
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
      const isKnown = yieldGroup(cityYield) === yieldName;

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
  cityYield: { _: string; value: number; __?: string[] },
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
        .getScaled(`./assets/${groupIcons[yieldGroup(cityYield)]}`, 2)
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
