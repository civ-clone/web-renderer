// The Wonders of the World report (F7, #992), worked out in the worker as the Top Cities are (#124), so the UI only ever
//  sees the finished rows: every Wonder built, its city and that city's owner now, and the ones lost with their city.

import City from '@civ-clone/core-city/City';
import { CityImprovementRegistry } from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import Player from '@civ-clone/core-player/Player';
import { WonderRegistry } from '@civ-clone/core-wonder/WonderRegistry';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import { WondersRow } from '@civ-clone/ui-protocol/reports';
import {
  CityKnowledgeDependencies,
  civilizationOf,
  cityKnowledge,
} from './topCities';
import { workerRules } from '../workerRules';

// A Wonder that has been built: standing in a city, and whose it is now, or lost with its city (`standing` is `null`).
export type BuiltWonder = {
  wonder: string;
  standing: {
    city: City;
    owner: Player;
  } | null;
};

/**
 * Every Wonder ever built, standing or lost, in the order the rule set's report lists them (Civ1's: Pyramids … Cure for
 *  Cancer), as the rule set's `wonderHistory` gives them (#971). A lost Wonder is nobody's: its destroyed city isn't
 *  passed on.
 */
export const builtWonders = ({
  wonders,
  cityImprovements,
}: {
  wonders: WonderRegistry;
  cityImprovements: CityImprovementRegistry;
}): BuiltWonder[] =>
  workerRules()
    .wonderHistory(wonders, cityImprovements)
    .flatMap(({ type, state, city, owner }): BuiltWonder[] =>
      state === 'never'
        ? []
        : [
            {
              wonder: typeNameOf(type),
              standing:
                state === 'standing' && city !== null && owner !== null
                  ? { city, owner }
                  : null,
            },
          ]
    );

// What the worker knows about one Wonder. `seen` and `met` decide how much of its city and owner the player is told.
export type WondersEntry = {
  wonder: string;
  // `null` for a Wonder lost with its city.
  city: {
    name: string;
    // The founder's civilization, which is whose list the city's name comes from (`Generic.city-name`).
    originalCivilization: string;
    // The city's owner now: a captured Wonder goes with its city.
    owner: {
      civilization: string;
      colors: [string, string] | null;
    };
    own: boolean;
    seen: boolean;
    met: boolean;
  } | null;
};

/** The rows, in the order the entries came. A lost Wonder has no place, no owner and isn't anyone's. */
export const wondersRows = (entries: WondersEntry[]): WondersRow[] =>
  entries.map(({ wonder, city }): WondersRow => {
    if (city === null) {
      return { wonder, destroyed: true, own: false, city: null, owner: null };
    }

    // Your own are always known to you.
    const known = city.own || city.met;

    return {
      wonder,
      destroyed: false,
      own: city.own,
      city:
        city.own || city.seen
          ? { name: city.name, civilization: city.originalCivilization }
          : null,
      owner: known
        ? { civilization: city.owner.civilization, colors: city.owner.colors }
        : null,
    };
  });

export type WondersDependencies = CityKnowledgeDependencies & {
  // Whose Wonders are the view's own (`ClientView.owns`): the reader's alone, unless the view says otherwise (#607).
  owns?: (player: Player) => boolean;
};

// What `player` knows about each Wonder built, in the order `built` gives them, ready for `wondersRows`.
export const wondersEntries = (
  player: Player,
  built: BuiltWonder[],
  { playerWorlds, hasMet, owns }: WondersDependencies
): WondersEntry[] => {
  const knowledge = cityKnowledge(player, { playerWorlds, hasMet });

  return built.map(({ wonder, standing }) => {
    if (standing === null) {
      return { wonder, city: null };
    }

    // The owner the rules give: the city's player now, a captor once it's taken.
    const { city, owner } = standing,
      own = owns ? owns(owner) : owner === player;

    return {
      wonder,
      city: {
        name: city.name(),
        originalCivilization: typeNameOf(
          city.originalPlayer().civilization().sourceClass()
        ),
        owner: civilizationOf(owner),
        own,
        seen: knowledge.seen(city),
        met: own || knowledge.met(owner),
      },
    };
  });
};
