// Which citizens the city screen draws, and with which sprites. Kept free of DOM
// imports so it can be tested in Node.

import { CitizenMood } from '../types';
import { t } from 'i18next';

// Which citizens are drawn as women and which as men: a pattern taken from `seed` (a city's name), so the same city
//  always looks the same.
export const citizenMask = (seed: string): string =>
  (parseInt(seed.replace(/[^a-z]/gi, ''), 36) || 0).toString(2);

/**
 * The moods the engine sends for a city's workers; none under rules that don't send them.
 */
export const citizenMoods = (city: {
  citizens?: { moods: CitizenMood[] };
}): CitizenMood[] => city.citizens?.moods ?? [];

// The sprite for each mood, in order, with the face (woman or man) taken from the seed's mask.
export const citizenSprites = (
  moods: CitizenMood[],
  seed: string
): string[] => {
  const mask = citizenMask(seed);

  return moods.map(
    (mood, index) =>
      `./assets/city/people_${mood}_${
        ['f', 'm'][parseInt(mask[index % mask.length], 10)]
      }.png`
  );
};

/**
 * The citizens in words, for a screen reader, since they're otherwise only drawn as faces (#272): "3 happy, 2 content,
 * 1 unhappy, 1 Entertainer". Moods with no one in them are left out, and the specialists follow in the order given.
 */
export const citizenSummary = (
  moods: CitizenMood[],
  specialists: string[]
): string => {
  const count = <T>(list: T[], value: T): number =>
      list.filter((item) => item === value).length,
    moodParts = (['happy', 'content', 'unhappy'] as CitizenMood[])
      .filter((mood) => count(moods, mood) > 0)
      .map((mood) => t(`City.Citizens.${mood}`, { count: count(moods, mood) })),
    specialistParts = specialists
      .filter((specialist, index) => specialists.indexOf(specialist) === index)
      .map((specialist) =>
        t(`City.Citizens.Specialist.${specialist}`, {
          count: count(specialists, specialist),
          // A specialist from a plugin still reads as a number and its name.
          defaultValue: `${count(specialists, specialist)} ${t(
            `City.Specialist.${specialist}`,
            { defaultValue: specialist }
          )}`,
        })
      );

  return [...moodParts, ...specialistParts].join(t('City.Citizens.separator'));
};
