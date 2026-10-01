// The arena's `rating`: Civ1's score plus what it leaves out, the treasury and the advances, both in one currency
//  (docs/arena.md). Pure reads: nothing here changes the game, draws a random number or mints an id, so #149's engine
//  measure can lift it.
//
// It reads the ruleset through its rules rather than repeating them: what an advance costs is `Cost`'s answer, and
//  what it needs first is `Requirements`'s.
import Advance from '@civ-clone/core-science/Advance';
import Cost from '@civ-clone/core-science/Rules/Cost';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import Requirements from '@civ-clone/core-science/Rules/Requirements';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';

// One trade point makes one gold or one bulb, so both are counted at a tenth: `floor(treasury / 10)`.
export const RATING_DIVISOR = 10;

export const ratingGold = (treasury: number): number =>
  Math.floor(treasury / RATING_DIVISOR);

export const ratingAdvances = (researchInvested: number): number =>
  Math.floor(researchInvested / RATING_DIVISOR);

// What the ruleset charges for `AdvanceType` when the player already knows `known` advances, asked of its `Cost` rules
//  with a stand-in for the player's research that knows that many.
export const advanceCost = (
  ruleRegistry: RuleRegistry,
  AdvanceType: typeof Advance,
  known: number
): number => {
  const standIn = {
    complete: (): Advance[] => new Array(known),
  } as unknown as PlayerResearch;
  const [cost] = ruleRegistry.process(Cost, AdvanceType, standIn) as number[];

  return cost ?? 0;
};

// The bulbs the player's advances cost, or would have cost had it researched them, in the order it holds them, plus
//  the progress towards the next one. An advance from a hut, a trade or a conquest is worth the same once held. Only
//  advances count: the free starting knowledge isn't one (nor is it in the ruleset's cost).
export const researchInvested = (
  ruleRegistry: RuleRegistry,
  known: (typeof Advance)[],
  progress: number
): number =>
  known.reduce(
    (total: number, AdvanceType: typeof Advance, index: number): number =>
      total + advanceCost(ruleRegistry, AdvanceType, index),
    0
  ) + progress;

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
