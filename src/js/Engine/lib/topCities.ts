// The Top Cities in the World report (#124), worked out in the worker so the UI only ever sees the finished rows.

export type TopCitiesCitizens = {
  happy: number;
  content: number;
  unhappy: number;
  // Specialist class names, e.g. `Entertainer`.
  specialists: string[];
};

// What the worker knows about one city. `seen` and `met` decide how much of it the player is told.
export type TopCitiesEntry = {
  name: string;
  // The founder's civilization, which is whose list the city's name comes from (`Generic.city-name`).
  originalCivilization: string;
  owner: {
    civilization: string;
    colors: [string, string] | null;
  };
  size: number;
  citizens: TopCitiesCitizens;
  wonders: string[];
  seen: boolean;
  met: boolean;
};

// One row as the UI gets it. Nothing in it identifies a city or a player beyond what is shown: no ids, no tiles and no
//  score, so a row for a city the player hasn't seen can't be matched to anything else.
export type TopCitiesRow = {
  rank: number;
  size: number;
  citizens: TopCitiesCitizens;
  wonders: string[];
  // Only for a city whose tile the player has seen.
  city: {
    name: string;
    civilization: string;
  } | null;
  // Only for a civilization the player has met.
  owner: {
    civilization: string;
    colors: [string, string] | null;
  } | null;
};

export const defaultTopCitiesLimit = 10;

// v474.05 (OpenCivOne `Reports.cs`, `ShowTopFiveCitiesReport`): 2 per happy citizen, 1 per content citizen or
//  specialist, nothing for an unhappy one, and 10 per Wonder in the city.
export const topCitiesScore = ({
  size,
  citizens: { happy, unhappy },
  wonders,
}: TopCitiesEntry): number => size + happy - unhappy + 10 * wonders.length;

// Highest score first. The sort is stable, so on a tie the city founded first (earlier in the list) stays ahead, as in
//  the original, where a city only moves up past one with a strictly lower score.
export const rankCities = (
  entries: TopCitiesEntry[],
  limit: number = defaultTopCitiesLimit
): TopCitiesEntry[] =>
  entries
    .map((entry) => ({ entry, score: topCitiesScore(entry) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
    .map(({ entry }) => entry);

export const topCitiesRows = (
  entries: TopCitiesEntry[],
  limit: number = defaultTopCitiesLimit
): TopCitiesRow[] =>
  rankCities(entries, limit).map((entry, index) => ({
    rank: index + 1,
    size: entry.size,
    citizens: {
      ...entry.citizens,
      specialists: [...entry.citizens.specialists],
    },
    wonders: [...entry.wonders],
    city: entry.seen
      ? {
          name: entry.name,
          civilization: entry.originalCivilization,
        }
      : null,
    owner: entry.met
      ? {
          civilization: entry.owner.civilization,
          colors: entry.owner.colors,
        }
      : null,
  }));
