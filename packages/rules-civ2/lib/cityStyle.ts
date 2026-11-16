import {
  Automobile,
  Electronics,
  Industrialization,
  Invention,
  Philosophy,
} from '@civ-clone/civ2-science/Advances';
import {
  CityImprovementRegistry,
  instance as cityImprovementRegistryInstance,
} from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import {
  ClientRegistry,
  instance as clientRegistryInstance,
} from '@civ-clone/core-client/ClientRegistry';
import {
  GameDifficultyRegistry,
  instance as gameDifficultyRegistryInstance,
} from '@civ-clone/core-difficulty/GameDifficultyRegistry';
import {
  PlayerResearchRegistry,
  instance as playerResearchRegistryInstance,
} from '@civ-clone/core-science/PlayerResearchRegistry';
import Advance from '@civ-clone/core-science/Advance';
import City from '@civ-clone/core-city/City';
import { King } from '@civ-clone/civ2-difficulty/Difficulties';
import { Palace } from '@civ-clone/civ2-city-improvement/CityImprovements';
import Player from '@civ-clone/core-player/Player';
import isHuman from '@civ-clone/civ2-difficulty/isHuman';
import { levelOf } from '@civ-clone/civ2-difficulty/level';

// How Civ2 draws a city and its citizens (M2c, #1007), from its owner's advances, for a tileset with Civ2's eras. The
//  rules are OpenCiv2's (richardpenman/civ2): the map's city row in `graphics.cpp` (~3335), the citizens' row in
//  `civ.cpp` `civ_city_style_era` (~2916).

/** The row of city sprites the map draws: the civilization's own style, or the industrial or modern one. */
export type CityStyleEra = 'ancient' | 'industrial' | 'modern';

/** The row of citizens the city screen draws. */
export type PeopleEra = 'ancient' | 'renaissance' | 'industrial' | 'modern';

export interface CityStyle {
  era: CityStyleEra;
  people: PeopleEra;
  /** Drawn one size larger: a Palace in a human player's city, or in a computer player's below King. */
  larger: boolean;
}

export interface CityStyleDependencies {
  cityImprovementRegistry?: CityImprovementRegistry;
  clientRegistry?: ClientRegistry;
  gameDifficultyRegistry?: GameDifficultyRegistry;
  playerResearchRegistry?: PlayerResearchRegistry;
}

const knows = (
  player: Player,
  playerResearchRegistry: PlayerResearchRegistry,
  ...advances: (typeof Advance)[]
): boolean => {
  try {
    const research = playerResearchRegistry.getByPlayer(player);

    return advances.every((AdvanceType) => research.completed(AdvanceType));
  } catch {
    return false;
  }
};

/** The map's row: Industrialization makes it industrial, Automobile and Electronics modern, whatever came first. */
export const cityStyleEra = (
  player: Player,
  playerResearchRegistry: PlayerResearchRegistry = playerResearchRegistryInstance
): CityStyleEra =>
  knows(player, playerResearchRegistry, Automobile, Electronics)
    ? 'modern'
    : knows(player, playerResearchRegistry, Industrialization)
    ? 'industrial'
    : 'ancient';

/** The citizens' row: Electronics and Automobile, Industrialization, Invention and Philosophy, in that order. */
export const peopleEra = (
  player: Player,
  playerResearchRegistry: PlayerResearchRegistry = playerResearchRegistryInstance
): PeopleEra =>
  knows(player, playerResearchRegistry, Electronics, Automobile)
    ? 'modern'
    : knows(player, playerResearchRegistry, Industrialization)
    ? 'industrial'
    : knows(player, playerResearchRegistry, Invention, Philosophy)
    ? 'renaissance'
    : 'ancient';

/**
 * Whether the city is drawn a size larger: one with a Palace, if a person plays its owner, or a computer player does
 *  at a level below King. The original asks whether it is the human at this screen's own civilization; with one person
 *  in a game that is any person.
 */
export const drawnLarger = (
  city: City,
  {
    cityImprovementRegistry = cityImprovementRegistryInstance,
    clientRegistry = clientRegistryInstance,
    gameDifficultyRegistry = gameDifficultyRegistryInstance,
  }: CityStyleDependencies = {}
): boolean =>
  cityImprovementRegistry
    .getByCity(city)
    .some((improvement) => improvement instanceof Palace) &&
  (isHuman(city.player(), clientRegistry) ||
    levelOf(gameDifficultyRegistry) < King.level());

export const cityStyle = (
  city: City,
  dependencies: CityStyleDependencies = {}
): CityStyle => {
  const { playerResearchRegistry = playerResearchRegistryInstance } =
    dependencies;

  return {
    era: cityStyleEra(city.player(), playerResearchRegistry),
    people: peopleEra(city.player(), playerResearchRegistry),
    larger: drawnLarger(city, dependencies),
  };
};

export default cityStyle;
