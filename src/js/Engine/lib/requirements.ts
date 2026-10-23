// What the ruleset's things need, make obsolete and are replaced by (#37), as the page asks for it: every requirement
//  entry, with classes as the keys saves use (`RailroadAdvance`, not `Railroad`), for the civilopedia (#183) to read.
//  The entries are definitions, the same for every player, so nothing here depends on who asks.

import {
  Condition,
  Range,
  Relation,
  Requirement,
  Target,
} from '@civ-clone/core-requirement/Requirement';
import { RequirementRegistry } from '@civ-clone/core-requirement/RequirementRegistry';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

/** A requirement's target on the wire: a class by its save key, or a condition a rule decides, by its id. */
export type RequirementTargetData = { class: string } | { condition: string };

export interface RequirementData {
  id: string;
  subject: string;
  relation: Relation;
  targets: RequirementTargetData[];
  mode: 'all' | 'any';
  range: Range;
  /** Where the subject must be, e.g. the terrains a tile improvement can go on, or `null` for anywhere. */
  where: string[] | null;
}

const targetData = (target: Target): RequirementTargetData =>
  target instanceof Condition
    ? { condition: target.id }
    : { class: typeNameOf(target as { type?: string; name: string }) };

/** Every entry in `requirements`, in the order they were added. */
export const requirementsData = (
  requirements: RequirementRegistry = defaultGame.requirements
): RequirementData[] =>
  requirements.entries().map(
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
