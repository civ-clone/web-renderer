import {
  RuleRegistry,
  instance as ruleRegistryInstance,
} from '@civ-clone/core-rule/RuleRegistry';
import Advance from '@civ-clone/core-science/Advance';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import Cost from '@civ-clone/core-science/Rules/Cost';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';

/**
 * The cost of each advance a player could research next, keyed on its name, so the research chooser can show how many
 * turns each would take (#15). `PlayerResearch#cost()` only holds the cost of the advance currently being researched,
 * and is `Infinity` between advances, which is exactly when the chooser opens.
 *
 * The UI only uses this while choosing, so it's skipped while an advance is being researched, to keep this provider
 * off the hot path the rest of the time (#44).
 */
export const researchCosts = (
  ruleRegistry: RuleRegistry = ruleRegistryInstance
): AdditionalData =>
  new AdditionalData(
    PlayerResearch,
    'costs',
    (playerResearch: PlayerResearch): { [advance: string]: number } => {
      if (playerResearch.researching() !== null) {
        return {};
      }

      return playerResearch
        .available()
        .reduce(
          (
            costs: { [advance: string]: number },
            AvailableAdvance: typeof Advance
          ) => {
            const [cost] = ruleRegistry.process(
              Cost,
              AvailableAdvance,
              playerResearch
            );

            if (typeof cost === 'number') {
              costs[AvailableAdvance.name] = cost;
            }

            return costs;
          },
          {}
        );
    }
  );

export default researchCosts;
