// The mood of each of a city's working citizens, worked out as the engine does (#269). Kept free of DOM imports so it
//  can be tested in Node against the engine's own function.

/** 0 for an unhappy citizen, 1 for a content one and 2 for a happy one. */
export type CitizenMood = 0 | 1 | 2;

/**
 * A port of `@civ-clone/civ1-city-happiness/lib/calculateCitizenState`, from counts rather than engine objects so the
 * Happiness report can step through a subset of the yields. Each `Unhappiness` makes a citizen unhappy, from the end
 * of the list. The specialists are taken out next, from the content citizens first and then the unhappy ones. Then each
 * `Happiness` makes the first content citizen happy or, where the first one not yet happy is unhappy, makes it content.
 * So the list is shorter than the city's size by one per specialist.
 */
export const citizenState = (
  size: number,
  happiness: number,
  unhappiness: number,
  specialists: number
): CitizenMood[] => {
  const state: CitizenMood[] = new Array(size).fill(1);

  let currentIndex = state.length - 1;

  while (unhappiness > 0 && currentIndex > -1) {
    state[currentIndex--] = 0;
    unhappiness--;
  }

  ([1, 0] as CitizenMood[]).forEach((mood) => {
    while (specialists > 0 && state.includes(mood)) {
      state.splice(state.lastIndexOf(mood), 1);
      specialists--;
    }
  });

  currentIndex = 0;

  while (happiness > 0 && currentIndex < state.length) {
    if (state[currentIndex] === 2) {
      currentIndex++;

      continue;
    }

    state[currentIndex] = state[currentIndex] === 0 ? 1 : 2;
    happiness--;
  }

  return state;
};
