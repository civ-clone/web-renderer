// Civ1's power ranking, the measure v474.05 ranks the civilizations by each turn and draws on the PowerGraph
//  (OpenCivOne, `GameEngine.cs` `F0_1238_0da1_RankPlayers`, L641-661; book p337), and what civ-clone/web-renderer#149
//  specifies as the engine's `rank(player)`:
//
//    power = coins / 32 + 8 × total city size + advances known + Σ over units of the unit type's cost
//
// where a unit type's cost is in v474.05's own unit, tens of shields (Militia 1, Settlers 4), so a unit is worth its
//  shield cost / 10. Every unit counts: Settlers, Diplomats, Caravans and ships too. A civilization no longer in the
//  game is 0. Reads only, so #149's engine measure can lift it, though asking the `BuildCost` rules makes them create
//  the cost they answer with: the arena asks once per unit type, after the game.
import BuildItem from '@civ-clone/core-city-build/BuildItem';
import BuildCost from '@civ-clone/core-city-build/Rules/BuildCost';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';
import Unit from '@civ-clone/core-unit/Unit';

// `coins / 32`, in v474.05's integer division (which truncates; a treasury is never negative anyway).
export const powerGold = (gold: number): number => Math.trunc(gold / 32);

// `TotalCitySize * 8`: the sum of the player's city sizes.
export const powerCitizens = (citySizes: number): number => 8 * citySizes;

// `DiscoveredTechnologyCount`. v474.05 sets it to 1 for each civilization at the start of the game and adds one for
//  every advance gained after turn 0, however it was gained, so the advances a civilization starts with aren't counted
//  but the 1 is.
export const powerAdvances = (advancesGainedSinceStart: number): number =>
  1 + advancesGainedSinceStart;

// A unit type's value: its build cost by the ruleset's `BuildCost` rules, in tens of shields. Asked with a stand-in
//  for a `BuildItem`, which those rules only ask for its `item()`.
export const unitValue = (
  ruleRegistry: RuleRegistry,
  UnitType: typeof Unit
): number => {
  const standIn = { item: () => UnitType } as unknown as BuildItem;
  const [cost] = ruleRegistry.process(BuildCost, standIn, null);

  return Math.floor((cost?.value() ?? 0) / 10);
};

// The value of each of `units`, looked up once per unit type.
export const powerUnits = (
  ruleRegistry: RuleRegistry,
  units: Unit[],
  cache: Map<typeof Unit, number> = new Map()
): number =>
  units.reduce((total: number, unit: Unit): number => {
    const UnitType = unit.constructor as typeof Unit;

    if (!cache.has(UnitType)) {
      cache.set(UnitType, unitValue(ruleRegistry, UnitType));
    }

    return total + cache.get(UnitType)!;
  }, 0);

export const power = (
  inGame: boolean,
  gold: number,
  citizens: number,
  advances: number,
  units: number
): number => (inGame ? gold + citizens + advances + units : 0);
