import {
  RuleRegistry,
  instance as ruleRegistryInstance,
} from '@civ-clone/core-rule/RuleRegistry';
import { IBuildable as Buildable } from '@civ-clone/core-city-build/Buildable';
import CityBuild, {
  ICityBuildChangedFrom,
} from '@civ-clone/core-city-build/CityBuild';
import ProductionChanged from '@civ-clone/core-city-build/Rules/ProductionChanged';

// What changing a city's build would keep (M2c, #1007): the engine's own answer, from the ruleset's `ProductionChanged`
//  rules (Civ2's change penalty is civ2-city's), so the change dialog can warn of a loss without knowing the rule.

/**
 * The turn's baseline `CityBuild#build` asks its rules from: what the build had before its first change this turn,
 *  while the progress is still what that change left it. `CityBuild` keeps it in a saved field with no accessor of its
 *  own (`_changedFrom`), read here as `build` reads it.
 */
const baselineOf = (
  cityBuild: CityBuild
): { item: Buildable | null; progress: number } | null => {
  const changedFrom = (
    cityBuild as unknown as { _changedFrom?: ICityBuildChangedFrom }
  )._changedFrom;

  return changedFrom !== undefined &&
    changedFrom.left === cityBuild.progress().value()
    ? { item: changedFrom.item, progress: changedFrom.progress }
    : null;
};

/**
 * The progress `cityBuild` would have after changing to `to` now, as `CityBuild#build` would set it: asked of the
 *  `ProductionChanged` rules from the turn's baseline, so changing back to the item the turn started with gives back
 *  what the first change took. With no rule, the progress as it is.
 */
export const progressAfterChange = (
  cityBuild: CityBuild,
  to: Buildable,
  ruleRegistry: RuleRegistry = ruleRegistryInstance
): number => {
  const progress = cityBuild.progress().value();

  if (ruleRegistry.get(ProductionChanged).length === 0) {
    return progress;
  }

  const baseline = baselineOf(cityBuild),
    previous =
      cityBuild.building()?.item() ?? cityBuild.cleared()?.item ?? null;

  if (baseline === null && previous === to) {
    return progress;
  }

  const from = baseline ?? { item: previous, progress },
    [answer] = ruleRegistry.process(
      ProductionChanged,
      cityBuild,
      from.item,
      to,
      from.progress
    );

  return answer ?? (to === from.item ? from.progress : progress);
};

export default progressAfterChange;
