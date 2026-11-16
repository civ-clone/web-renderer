import {
  City as CityData,
  City,
  CitizenMood,
  CitizenStage,
  CityBuild,
  CityGrowth,
  PlayerResearch,
  Specialist,
  Yield,
} from '@civ-clone/ui-protocol/types';
import { groupIcons } from '@civ-clone/ui-assets/lib/groupIcons';
import {
  reduceKnownYield,
  yieldGroup,
} from '@civ-clone/ui-client/lib/yieldMap';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import currentTileset, {
  installedTilesets,
} from '@civ-clone/ui-assets/lib/tilesets';
import {
  TilesetDescriptor,
  expandName,
  spriteKey,
} from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import {
  citizenMoods,
  citizenSpriteChoices,
  citizenSummary,
  peopleFaces,
  specialistFaces,
  specialistSprites,
} from '@civ-clone/ui-client/lib/citizens';
import { orderSpecialists } from '@civ-clone/ui-client/lib/specialists';
import { s } from '@dom111/element';
import { t } from 'i18next';

// Here as well as on their own, as most of what shows a city's turns uses the rest of this too.
export {
  buildTurns,
  growthTurns,
  turnsLeft,
} from '@civ-clone/ui-client/lib/cityTurns';

const specialistIcons: { [key: string]: string } = {
  Entertainer: 'luxury',
  TaxCollector: 'tax',
  Scientist: 'science',
};

// The installed pack with citizens of its own (Civ2's people, M2c), if any.
const peoplePack = (): TilesetDescriptor | null =>
  installedTilesets().find(({ people }) => people !== undefined) ?? null;

/**
 * The keys of a pack's own `face` to try first, for a city whose rules send its citizens' era (`City.style.people`,
 *  M2c): the pack's small one without an era, which fits the citizens' row, then the era's large one. None without an
 *  era or such a pack.
 */
const peopleKeys = (face: string, era: string | undefined): string[] => {
  const pack = era === undefined ? null : peoplePack();

  if (pack === null) {
    return [];
  }

  const { sprite, small } = pack.people!;

  // The small faces first: they fit the citizens' row, where the era's large ones are shrunk past reading.
  return [
    ...(small ? [spriteKey(pack, expandName(small, { face }))] : []),
    spriteKey(pack, expandName(sprite, { era: era!, face })),
  ];
};

// Draws the first of `keys` that has been imported: a pack's own face (M2c), then the interface tileset's `sprites`
//  (`city/people_tax_f`, `city/people_tax`). An angry citizen drawn with the interface's unhappy face, which is all it
//  has, is marked so it can be told apart (`angry-fallback`).
const renderCitizen = (
  sprites: string[],
  title?: string,
  packKeys: string[] = []
): HTMLElement => {
  const citizen = s('<span class="citizen"></span>'),
    interfaceKeys = sprites.map((sprite) =>
      spriteKey(currentTileset(), sprite)
    );

  if (title) {
    citizen.setAttribute('title', title);
  }

  assetStore
    .firstImported([...packKeys, ...interfaceKeys])
    .then((path) => {
      if (
        sprites[0]?.includes('people_angry_') &&
        path !== interfaceKeys[0] &&
        !packKeys.includes(path)
      ) {
        citizen.classList.add('angry-fallback');
      }

      return assetStore.shownAtURL(path, currentTileset().ui.citizen.width);
    })
    .then((url) =>
      // Decorative: the population as a whole is summarised in words (#272).
      citizen.append(s(`<img src="${url}" alt="">`))
    );

  return citizen;
};

/** One citizen's face for `mood`, as a report's column heading (#744). Decorative: the heading says the mood. */
export const citizenFace = (mood: CitizenMood): HTMLElement => {
  const face = renderCitizen(citizenSpriteChoices([mood], mood)[0]!);

  face.setAttribute('aria-hidden', 'true');

  return face;
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
    // A specialist the rules allow no other kind of (Civ2's Entertainers below size 5, M2c) has nothing to change to.
    onSpecialistClick && (city.specialistsAvailable?.length ?? 2) > 1
      ? onSpecialistClick
      : undefined,
    city.style?.people
  );

// Draws the workers, one citizen per mood, and then the specialists.
const drawCitizens = <SpecialistType extends { _: string }>(
  moods: CitizenMood[],
  specialists: SpecialistType[],
  seed: string,
  onSpecialistClick?: (specialist: SpecialistType) => void,
  era?: string
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

  const faces = peopleFaces(moods);

  citizenSpriteChoices(moods, seed).forEach((sprites, index) =>
    population.append(
      renderCitizen(sprites, undefined, peopleKeys(faces[index]!, era))
    )
  );

  const sprites = specialistSprites(
    specialists.map(({ _ }) => specialistIcons[_] ?? 'luxury'),
    moods.length,
    seed
  );

  specialists.forEach((specialist, index) => {
    const citizen = renderCitizen(
      // One for each specialist.
      sprites[index]!,
      t(`City.Specialist.${specialist._}`),
      specialistFaces[specialist._]
        ? peopleKeys(specialistFaces[specialist._]!, era)
        : []
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

/** The moods a stage's counts come to (M2c): happy, content, unhappy, then angry, `workers` in all. */
export const stageMoods = (
  { happy, unhappy, angry }: CitizenStage,
  workers: number
): CitizenMood[] => {
  const angryShown = Math.min(angry, unhappy),
    unhappyShown = Math.min(unhappy, workers) - angryShown,
    happyShown = Math.min(happy, workers - unhappyShown - angryShown);

  return [
    ...new Array<CitizenMood>(happyShown).fill('happy'),
    ...new Array<CitizenMood>(
      Math.max(0, workers - happyShown - unhappyShown - angryShown)
    ).fill('content'),
    ...new Array<CitizenMood>(unhappyShown).fill('unhappy'),
    ...new Array<CitizenMood>(angryShown).fill('angry'),
  ];
};

/**
 * The city's citizens after each of its rules' stages of happiness (Civ2's: the base, luxuries, buildings, martial law
 *  or units, and Wonders, M2c), as Civ2's city screen lists them: a row of faces for each, with the stage's name.
 *  `null` under rules that don't send stages (Civ1), whose screens show nothing more.
 */
export const renderHappinessStages = (city: CityData): HTMLElement | null => {
  const stages = city.citizens?.stages;

  if (!stages || stages.length === 0) {
    return null;
  }

  const workers = citizenMoods(city).length;

  return s(
    '<div class="happiness-stages"></div>',
    ...stages.map((stage) =>
      s(
        `<div class="happiness-stage" data-stage="${stage.name}"></div>`,
        s(
          '<span class="happiness-stage-name"></span>',
          t(`City.Happiness.stage.${stage.name}`, { defaultValue: stage.name })
        ),
        drawCitizens(
          stageMoods(stage, workers),
          [],
          city.name,
          undefined,
          city.style?.people
        )
      )
    )
  );
};

/** The stages under a heading that opens them, for a city screen: empty under rules without stages. */
export const renderHappinessPanel = (city: CityData): HTMLElement | string => {
  const stages = renderHappinessStages(city);

  return stages === null
    ? ''
    : s(
        '<details class="happiness-stages-panel"></details>',
        s('<summary></summary>', t('City.Happiness.title')),
        stages
      );
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

export const turnsText = (turns: number) =>
  t('Progress.turns', { count: turns });

/** A yield's total, the part of it used and the part left over. */
export type YieldTotals = [total: number, used: number, free: number];

export const yieldData = (city: CityData, yieldName: string) =>
  city.yields.reduce<YieldTotals>(
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
  const icon = s('<span class="yield-icon"></span>'),
    path = groupIcons[group];

  // A group without a picture: the amount beside it says it all, as below.
  if (path === undefined) {
    return icon;
  }

  assetStore
    .shownAtURL(spriteKey(currentTileset(), path), currentTileset().ui.icon)
    .then((url) => icon.append(s(`<img src="${url}" alt="">`)))
    // A tileset without the picture: the amount beside it says it all.
    .catch(() => {});

  return icon;
};

/**
 * The figures beside a meter: the stored and the cost, what comes in each turn, and how many turns are left, or `until`
 *  in their place when the turns would mislead ("Needs an Aqueduct", #781). The icon is decorative, so the yield is
 *  named for a screen reader.
 */
export const renderFigures = (
  group: string,
  data: CityGrowth | CityBuild,
  perTurn: number,
  turns: number,
  until: string | null = null
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
    until === null
      ? s(`<span class="turns">${turnsText(turns)}</span>`)
      : s('<span class="turns"></span>', document.createTextNode(until))
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
