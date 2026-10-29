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
 * How far a city is towards growing or finishing its build, as a bar (#686, #687): the part already stored, then a
 *  striped part for what comes in next turn, or a red one for what a shortfall takes away. A tick marks every 10, as
 *  Civ1's food box has a column for each 10 (every 20 or more for a large cost, so they stay apart). Decorative: the
 *  figures are said in words alongside.
 */
export const renderMeter = (
  group: string,
  stored: number,
  capacity: number,
  perTurn: number
): HTMLElement => {
  // None for a capacity that isn't a count (an item's cost is `Infinity` until one is chosen).
  capacity = Number.isFinite(capacity) ? Math.max(0, capacity) : 0;

  const meter = s(
    `<div class="meter" data-yield="${group}" aria-hidden="true"><span class="fill"></span><span class="next"></span></div>`
  );

  if (capacity === 0) {
    meter.hidden = true;

    return meter;
  }

  const clamp = (value: number, max: number) =>
      Number.isFinite(value) ? Math.max(0, Math.min(value, max)) : 0,
    percent = (value: number) => `${(value / capacity) * 100}%`,
    loss = perTurn < 0 ? clamp(-perTurn, clamp(stored, capacity)) : 0,
    done = clamp(stored, capacity) - loss,
    next = loss > 0 ? loss : clamp(perTurn, capacity - done),
    tick = 10 * Math.ceil(capacity / 300),
    [fill, coming] = Array.from(meter.children) as HTMLElement[];

  fill.style.width = percent(done);
  coming.style.width = percent(next);
  coming.classList.toggle('loss', loss > 0);

  meter.style.setProperty('--tick', percent(Math.min(tick, capacity)));

  return meter;
};

/**
 * The figures beside a meter: the stored and the cost, what comes in each turn, and how many turns are left. The icon
 *  is decorative, so the yield is named for a screen reader.
 */
export const renderFigures = (
  group: string,
  data: CityGrowth | CityBuild,
  perTurn: number,
  turns: number
): HTMLElement =>
  s(
    `<p class="figures"></p>`,
    s(
      `<span class="stored"></span>`,
      s(
        `<span class="visually-hidden">${t(`${group}.name`, {
          defaultValue: group,
          ns: 'yield',
        })}: </span>`
      ),
      yieldIcon(group),
      t('Progress.data', {
        progress: data.progress.value,
        total: data.cost.value,
      }) as string
    ),
    s(
      `<span class="per-turn${perTurn < 0 ? ' negative' : ''}">${t(
        'City.Progress.per-turn',
        { count: perTurn }
      )}</span>`
    ),
    s(`<span class="turns">${turnsText(turns)}</span>`)
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
    .map(() => yieldIcon(yieldGroup(cityYield)));

export const yieldLabel = (cityYield: Yield) =>
  t(`${cityYield._}.name`, {
    defaultValue: cityYield._,
    ns: 'yield',
  });
