// The Top Cities in the World report (#124), worked out in the worker so the UI only ever sees the finished rows.

import City from '@civ-clone/core-city/City';
import { CityGrowthRegistry } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { CityRegistry } from '@civ-clone/core-city/CityRegistry';
import Player from '@civ-clone/core-player/Player';
import { PlayerWorldRegistry } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { SpecialistRegistry } from '@civ-clone/core-city/SpecialistRegistry';
import { WonderRegistry } from '@civ-clone/core-wonder/WonderRegistry';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import { workerRules } from '../workerRules';
import {
  TopCitiesCitizens,
  TopCitiesRow,
} from '@civ-clone/ui-protocol/reports';

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

export type TopCitiesDependencies = {
  cities: Pick<CityRegistry, 'entries'>;
  cityGrowths: Pick<CityGrowthRegistry, 'getByCity'>;
  specialists: SpecialistRegistry;
  wonders: Pick<WonderRegistry, 'getByCity'>;
  playerWorlds: Pick<PlayerWorldRegistry, 'getByPlayer'>;
  hasMet: (player: Player) => boolean;
};

// A civilization as the reports name it: its type name and its colours, if it has any.
export const civilizationOf = (
  player: Player
): { civilization: string; colors: [string, string] | null } => {
  const colors = player
    .civilization()
    .attributes()
    .find((attribute) => attribute.name() === 'colors');

  return {
    civilization: typeNameOf(player.civilization().sourceClass()),
    colors: colors ? (colors.value() as [string, string]) : null,
  };
};

export type CityKnowledgeDependencies = Pick<
  TopCitiesDependencies,
  'playerWorlds' | 'hasMet'
>;

/**
 * What `player` knows of a city, as the reports that name other civilizations' cities tell it (#124, #992): whether
 *  it has seen the city's tile, and whether it has met the city's owner. `met` asks about each owner once (#503).
 */
export const cityKnowledge = (
  player: Player,
  { playerWorlds, hasMet }: CityKnowledgeDependencies
): { seen: (city: City) => boolean; met: (owner: Player) => boolean } => {
  const playerWorld = playerWorlds.getByPlayer(player),
    metPlayers = new Map<Player, boolean>();

  return {
    seen: (city: City): boolean => playerWorld.getByTile(city.tile()) !== null,
    met: (owner: Player): boolean => {
      if (!metPlayers.has(owner)) {
        metPlayers.set(owner, hasMet(owner));
      }

      return metPlayers.get(owner)!;
    },
  };
};

// What `player` knows about every city still in the world, in founding order, ready for `topCitiesRows` to rank. A
//  destroyed city stays in the registry, so it's left out here, as v474.05's report never sees one (#995).
export const topCitiesEntries = (
  player: Player,
  {
    cities,
    cityGrowths,
    specialists,
    wonders,
    playerWorlds,
    hasMet,
  }: TopCitiesDependencies
): TopCitiesEntry[] => {
  const knowledge = cityKnowledge(player, { playerWorlds, hasMet });

  return cities
    .entries()
    .filter((city: City) => !city.destroyed())
    .map((city: City) => {
      const owner = city.player(),
        cityGrowth = cityGrowths.getByCity(city),
        [unhappy, content, happy] = workerRules().citizenMoods(
          cityGrowth,
          specialists
        );

      return {
        name: city.name(),
        originalCivilization: typeNameOf(
          city.originalPlayer().civilization().sourceClass()
        ),
        owner: civilizationOf(owner),
        size: cityGrowths.getByCity(city).size(),
        citizens: {
          happy,
          content,
          unhappy,
          specialists: specialists
            .getByCity(city)
            .map((specialist) => typeNameOf(specialist.sourceClass())),
        },
        wonders: wonders
          .getByCity(city)
          .map((wonder) => typeNameOf(wonder.sourceClass())),
        seen: knowledge.seen(city),
        met: knowledge.met(owner),
      };
    });
};
