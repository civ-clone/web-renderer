import {
  PlayerGovernmentRegistry,
  instance as playerGovernmentRegistryInstance,
} from '@civ-clone/core-government/PlayerGovernmentRegistry';
import {
  RuleRegistry,
  instance as ruleRegistryInstance,
} from '@civ-clone/core-rule/RuleRegistry';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import { ANARCHY } from '@civ-clone/civ2-rules/data/governments';
import City from '@civ-clone/core-city/City';
import CityBuild from '@civ-clone/core-city-build/CityBuild';
import CivilDisorder from '@civ-clone/core-city-happiness/Rules/CivilDisorder';
import { Production } from '@civ-clone/civ2-city/Yields';
import Tile from '@civ-clone/core-world/Tile';
import Yield from '@civ-clone/core-yield/Yield';
import { availableSpecialists } from '@civ-clone/library-city/lib/assignWorkers';
import { IBuildable as Buildable } from '@civ-clone/core-city-build/Buildable';
import { autoModeOf } from '@civ-clone/civ2-city/lib/autoMode';
import cityStyle from '../lib/cityStyle';
import progressAfterChange from '../lib/productionChange';
import governmentOf from '@civ-clone/civ2-city/lib/government';
import {
  isBuildingCapitalization,
  isCapitalization,
} from '@civ-clone/base-city-improvement-capitalization/lib/capitalizationRules';

// What Civ2's cities send the interface (M2c, #1007). Only Civ2's rules register these, so a Civ1 city's payload has
//  none of the keys and is as it was.

/** A square's yields as the city that works it gets them: by name and amount, as the map draws a square's. */
export type SquareYields = {
  x: number;
  y: number;
  yields: { _: string; value: number }[];
};

/**
 * Each square in the city's radius, with what it yields this city (`City#tileYields`, civ2-city's per-square steps:
 *  the Harbour, the Supermarket, Colossus, celebration and the rest), which differs from what the square yields on its
 *  own (`Tile#yields`), which the map and the tooltip otherwise show.
 */
export const citySquareYields = (): AdditionalData =>
  new AdditionalData(City, 'squareYields', (city: City): SquareYields[] => {
    const rules = city.tileYieldRules();

    return city
      .tiles()
      .entries()
      .map(
        (tile: Tile): SquareYields => ({
          x: tile.x(),
          y: tile.y(),
          yields: city.tileYields(tile, rules).map((tileYield: Yield) => ({
            _: tileYield.constructor.name,
            value: tileYield.value(),
          })),
        })
      );
  });

/** The city's style row and citizens' row, from its owner's advances, and whether it's drawn a size larger. */
export const cityStyleData = (): AdditionalData =>
  new AdditionalData(City, 'style', (city: City) => cityStyle(city));

/** The kinds of specialist the city may have now (`SpecialistAvailable`: Civ2's Entertainers only below size 5). */
export const citySpecialistsAvailable = (): AdditionalData =>
  new AdditionalData(City, 'specialistsAvailable', (city: City): string[] =>
    availableSpecialists(city).map((SpecialistType) => SpecialistType.name)
  );

/**
 * The gold `city` makes each turn building Capitalization: its shields after its units' support and waste, one for
 *  one, as civ2-city's production step pays them; none under Anarchy or in civil disorder.
 */
export const capitalizationGoldOf = (
  city: City,
  ruleRegistry: RuleRegistry = ruleRegistryInstance,
  playerGovernmentRegistry: PlayerGovernmentRegistry = playerGovernmentRegistryInstance
): number => {
  const yields = city.yields();

  if (
    governmentOf(city.player(), playerGovernmentRegistry) === ANARCHY ||
    ruleRegistry
      .process(CivilDisorder, city, yields)
      .some((result: boolean) => result)
  ) {
    return 0;
  }

  return Math.max(
    0,
    yields
      .filter((cityYield) => cityYield instanceof Production)
      .reduce((total, cityYield) => total + cityYield.value(), 0)
  );
};

/** The gold a city building Capitalization makes each turn (`capitalizationGoldOf`); `null` for any other build. */
export const capitalizationGold = (
  ruleRegistry: RuleRegistry = ruleRegistryInstance,
  playerGovernmentRegistry: PlayerGovernmentRegistry = playerGovernmentRegistryInstance
): AdditionalData =>
  new AdditionalData(
    CityBuild,
    'goldPerTurn',
    (cityBuild: CityBuild): number | null =>
      isBuildingCapitalization(cityBuild)
        ? capitalizationGoldOf(
            cityBuild.city(),
            ruleRegistry,
            playerGovernmentRegistry
          )
        : null
  );

/**
 * What the build list adds to an item (`WorkerRules.buildItemDetails`): the progress a change to it would leave
 *  (civ2-city's change penalty, `progressAfterChange`), and, for Capitalization, the gold it would make each turn.
 */
export const buildItemDetails = (
  cityBuild: CityBuild,
  Item: Buildable,
  rules: RuleRegistry
): { progressAfterChange: number; goldPerTurn?: number } => ({
  progressAfterChange: progressAfterChange(cityBuild, Item, rules),
  ...(isCapitalization(Item)
    ? { goldPerTurn: capitalizationGoldOf(cityBuild.city(), rules) }
    : {}),
});

/** What a city on Auto chooses from (civ2-city's `autoModeOf`), `null` while it isn't on Auto. */
export const cityAutoMode = (): AdditionalData =>
  new AdditionalData(CityBuild, 'autoMode', (cityBuild: CityBuild) =>
    autoModeOf(cityBuild)
  );

export const cities = (): AdditionalData[] => [
  citySquareYields(),
  cityStyleData(),
  citySpecialistsAvailable(),
  capitalizationGold(),
  cityAutoMode(),
];

export default cities;
