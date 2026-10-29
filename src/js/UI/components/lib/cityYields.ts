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
  const net = reduceKnownYield(yields, yieldName),
    remaining = data.cost.value - data.progress.value;

  // Done at the end of the turn, whatever comes in: progress already covers the cost.
  if (remaining <= 0) {
    return 1;
  }

  // 0, which the translations say as `Never`, with nothing to spare or a shortfall: a starving city counted its
  //  shortfall as progress (#489).
  if (net <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(remaining / net));
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

/**
 * One icon for a group of yields (`Gold`, `Research`, `Trade` and so on, see `groupIcons`), drawn once its picture has
 *  loaded. Decorative: wherever an amount is shown, its number is there as text too (#683).
 */
export const yieldIcon = (group: string): HTMLElement => {
  const icon = s('<span class="yield-icon"></span>');

  assetStore
    .getScaled(`./assets/${groupIcons[group]}`, 2)
    .then((image) =>
      icon.append(s(`<img src="${image.toDataURL('image/png')}" alt="">`))
    );

  return icon;
};

/**
 * A store of a yield as Civ1 draws it, a box of `capacity` cells with one icon for each of the `stored` (#686, #687):
 *  the food a city has towards growing, or the shields towards its build. The grid is `columns` wide and as tall as the
 *  capacity needs, and its cells shrink to fit the area, so a large store's icons overlap as Civ1's do. Decorative: the
 *  progress is said in words alongside.
 */
export const renderStore = (
  group: string,
  stored: number,
  capacity: number,
  columns: number
): HTMLElement => {
  // Whole cells only, and none for a capacity that isn't a count (an item's cost is `Infinity` until one is chosen).
  capacity = Number.isFinite(capacity) ? Math.max(0, Math.ceil(capacity)) : 0;

  const count = Number.isFinite(stored)
      ? Math.max(0, Math.min(Math.trunc(stored), capacity))
      : 0,
    store = s(
      `<div class="store" data-yield="${group}" aria-hidden="true"></div>`
    );

  // The last column keeps a whole icon's width, so a squeezed row's last icon stays inside the box.
  if (capacity === 0) {
    store.hidden = true;

    return store;
  }

  store.style.setProperty('--columns', `${columns}`);
  store.style.setProperty(
    'grid-template-columns',
    columns > 1
      ? `repeat(${columns - 1}, minmax(0, var(--cell))) var(--cell)`
      : 'var(--cell)'
  );
  store.style.setProperty(
    'grid-template-rows',
    `repeat(${Math.ceil(capacity / columns)}, var(--cell))`
  );

  // One image for the whole box: a Wonder's store can hold hundreds of shields.
  assetStore
    .getScaled(`./assets/${groupIcons[group]}`, 2)
    .then((image) => image.toDataURL('image/png'))
    .then((source) =>
      store.append(
        ...new Array(count).fill(0).map(() => s(`<img src="${source}" alt="">`))
      )
    );

  return store;
};

// Civ1 lays its food store out in 10 rows, a column for each 10 food the city needs to grow (`size + 1` columns).
export const foodStoreColumns = (capacity: number): number =>
  Math.max(1, Math.ceil(capacity / 10));

// And its shields 10 to a row, widening by 10 for each 100 shields, so the box is never more than 10 rows tall.
export const shieldStoreColumns = (capacity: number): number =>
  10 * Math.max(1, Math.ceil(capacity / 100));

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
    .map(() => yieldIcon(yieldGroup(cityYield)));

export const yieldLabel = (cityYield: Yield) =>
  t(`${cityYield._}.name`, {
    defaultValue: cityYield._,
    ns: 'yield',
  });
