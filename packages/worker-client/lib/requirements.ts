// What the ruleset's things need, make obsolete and are replaced by (#37), as the page asks for it: every requirement
//  entry, with classes as the keys saves use (`RailroadAdvance`, not `Railroad`), for the civilopedia (#183) to read.
//  The entries are definitions, the same for every player, so nothing here depends on who asks.

import {
  Condition,
  Requirement,
  Target,
} from '@civ-clone/core-requirement/Requirement';
import { RequirementRegistry } from '@civ-clone/core-requirement/RequirementRegistry';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import {
  RequirementTargetData,
  RequirementData,
} from '@civ-clone/ui-protocol/requirements';

const targetData = (target: Target): RequirementTargetData =>
  target instanceof Condition
    ? { condition: target.id }
    : { class: typeNameOf(target as { type?: string; name: string }) };

/**
 * Whether an entry's own rule is in force: one whose rule has been switched off, by a rule set the game was started
 *  without (#158), is not. An entry no rule is made from always is.
 */
export const inForce = (
  entry: Requirement,
  rules: RuleRegistry = defaultGame.rules
): boolean => rules.getById(entry.id)?.enabled() !== false;

/**
 * The entries in force, in the order they were added: those whose rules are, less what only follows from an entry
 *  that isn't. A unit that no longer goes obsolete is no longer replaced by anything either, though no rule is made
 *  from "replaced by": the civilopedia should not say a Phalanx gives way to Musketeers in a game where it never does.
 */
export const entriesInForce = (
  requirements: RequirementRegistry = defaultGame.requirements,
  rules: RuleRegistry = defaultGame.rules
): Requirement[] => {
  const entries = requirements.entries(),
    obsoleted = (subject: Requirement['subject'], kept: boolean): boolean =>
      entries.some(
        (entry: Requirement): boolean =>
          entry.subject === subject &&
          entry.relation === 'obsoletedBy' &&
          inForce(entry, rules) === kept
      );

  return entries.filter(
    (entry: Requirement): boolean =>
      inForce(entry, rules) &&
      !(
        entry.relation === 'replacedBy' &&
        obsoleted(entry.subject, false) &&
        !obsoleted(entry.subject, true)
      )
  );
};

/** Every entry in force, as the page asks for them. */
export const requirementsData = (
  requirements: RequirementRegistry = defaultGame.requirements,
  rules: RuleRegistry = defaultGame.rules
): RequirementData[] =>
  entriesInForce(requirements, rules).map(
    (entry: Requirement): RequirementData => ({
      id: entry.id,
      subject: typeNameOf(entry.subject as { type?: string; name: string }),
      relation: entry.relation,
      targets: entry.targets.map(targetData),
      mode: entry.mode,
      range: entry.range,
      where:
        entry.where?.map((Class) =>
          typeNameOf(Class as { type?: string; name: string })
        ) ?? null,
    })
  );

export default requirementsData;
