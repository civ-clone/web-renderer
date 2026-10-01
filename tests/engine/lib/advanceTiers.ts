// The arena's `advanceTiers`: each advance weighted by its depth in the tree of prerequisites, which the ruleset's
//  `Requirements` rules give (docs/arena.md). Informational: it isn't part of `power`. Pure reads: nothing here changes
//  the game, draws a random number or mints an id.
import Advance from '@civ-clone/core-science/Advance';
import Requirements from '@civ-clone/core-science/Rules/Requirements';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';

// A stand-in for a known advance, for asking `Requirements`: `instanceof` holds, and no constructor runs, so no id is
//  minted.
const standInFor = (AdvanceType: typeof Advance): Advance =>
  Object.create(AdvanceType.prototype);

// The advances `AdvanceType` needs first, by its `Requirements` rules: those without which, everything else known, it
//  isn't available.
export const prerequisites = (
  ruleRegistry: RuleRegistry,
  all: (typeof Advance)[],
  AdvanceType: typeof Advance
): (typeof Advance)[] => {
  const rules = (ruleRegistry.get(Requirements) as Requirements[]).filter(
    (rule: Requirements): boolean =>
      rule.validate(AdvanceType, all.map(standInFor))
  );
  const availableWith = (known: Advance[]): boolean =>
    rules.every(
      (rule: Requirements): boolean => rule.process(AdvanceType, known) === true
    );

  return all.filter(
    (Other: typeof Advance): boolean =>
      Other !== AdvanceType &&
      !availableWith(
        all
          .filter(
            (Known: typeof Advance): boolean =>
              Known !== AdvanceType && Known !== Other
          )
          .map(standInFor)
      )
  );
};

// Each advance's tier: the length of its longest chain of prerequisites, counting itself, so an advance that needs
//  nothing is 1. Worked out once per ruleset and kept.
export const tiers = (
  ruleRegistry: RuleRegistry,
  all: (typeof Advance)[]
): Map<typeof Advance, number> => {
  const found = new Map<typeof Advance, number>();
  const required = new Map<typeof Advance, (typeof Advance)[]>(
    all.map((AdvanceType) => [
      AdvanceType,
      prerequisites(ruleRegistry, all, AdvanceType),
    ])
  );
  const tierOf = (AdvanceType: typeof Advance, seen: number): number => {
    if (found.has(AdvanceType)) {
      return found.get(AdvanceType)!;
    }

    // A cycle in the requirements would otherwise never end.
    if (seen > all.length) {
      return 1;
    }

    const tier =
      1 +
      Math.max(
        0,
        ...(required.get(AdvanceType) ?? []).map((Required) =>
          tierOf(Required, seen + 1)
        )
      );

    found.set(AdvanceType, tier);

    return tier;
  };

  all.forEach((AdvanceType) => tierOf(AdvanceType, 0));

  return found;
};

export const advanceTiers = (
  tierMap: Map<typeof Advance, number>,
  known: (typeof Advance)[]
): number =>
  known.reduce(
    (total: number, AdvanceType: typeof Advance): number =>
      total + (tierMap.get(AdvanceType) ?? 1),
    0
  );
