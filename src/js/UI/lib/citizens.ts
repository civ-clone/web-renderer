// Which citizens the city screen draws, and with which sprites. Kept free of DOM
// imports so it can be tested in Node.

import { CitizenMood } from '../types';

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
