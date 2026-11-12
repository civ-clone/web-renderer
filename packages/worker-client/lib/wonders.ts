// The Wonders of the World report (F7, #992), worked out in the worker as the Top Cities are (#124), so the UI only ever
//  sees the finished rows: every Wonder built, its city and that city's owner now, and the ones lost with their city.

import City from '@civ-clone/core-city/City';
import Player from '@civ-clone/core-player/Player';
import { AvailableCityBuildItemsRegistry } from '@civ-clone/core-city-build/AvailableCityBuildItemsRegistry';
import Wonder from '@civ-clone/core-wonder/Wonder';
import { WonderRegistry } from '@civ-clone/core-wonder/WonderRegistry';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import { WondersRow } from '@civ-clone/ui-protocol/reports';
import {
  CityKnowledgeDependencies,
  civilizationOf,
  cityKnowledge,
} from './topCities';

// A Wonder that has been built: standing in its city, or lost with it (`city` is `null`).
export type BuiltWonder = {
  wonder: string;
  city: City | null;
};

/**
 * Every Wonder ever built. Today only the standing ones: the registry forgets a Wonder once its city is destroyed, so
 *  none comes back lost yet. The engine's answer for those (#971) goes here, each as `{ wonder, city: null }`, and
 *  nothing after this needs to change.
 */
export const builtWonders = ({
  wonders,
}: {
  wonders: Pick<WonderRegistry, 'entries'>;
}): BuiltWonder[] =>
  wonders.entries().map((wonder: Wonder) => ({
    wonder: typeNameOf(wonder.sourceClass()),
    city: wonder.city(),
  }));

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

/**
 * The rows, in `order` (the Wonders' type names, as the game gives them), any Wonder it doesn't name after those, in the
 *  order they came. A lost Wonder has no place, no owner and isn't anyone's.
 */
export const wondersRows = (
  entries: WondersEntry[],
  order: string[]
): WondersRow[] => {
  const place = (wonder: string): number => {
    const index = order.indexOf(wonder);

    return index === -1 ? order.length : index;
  };

  return entries
    .map((entry, index) => ({ entry, index, place: place(entry.wonder) }))
    .sort((a, b) => a.place - b.place || a.index - b.index)
    .map(({ entry: { wonder, city } }): WondersRow => {
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
};

export type WondersDependencies = CityKnowledgeDependencies & {
  // Whose Wonders are the view's own (`ClientView.owns`): the reader's alone, unless the view says otherwise (#607).
  owns?: (player: Player) => boolean;
};

// What `player` knows about each Wonder built, in the order `built` gives them, ready for `wondersRows` to order.
export const wondersEntries = (
  player: Player,
  built: BuiltWonder[],
  { playerWorlds, hasMet, owns }: WondersDependencies
): WondersEntry[] => {
  const knowledge = cityKnowledge(player, { playerWorlds, hasMet });

  return built.map(({ wonder, city }) => {
    if (city === null) {
      return { wonder, city: null };
    }

    const owner = city.player(),
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

/** The Wonders' type names in the order the game gives them: the order its build items were made available in. */
export const wonderOrder = (
  availableCityBuildItems: Pick<AvailableCityBuildItemsRegistry, 'entries'>
): string[] =>
  (availableCityBuildItems.entries() as unknown as Function[])
    .filter((Item) => Item.prototype instanceof Wonder)
    .map((Item) => typeNameOf(Item as typeof Wonder));
