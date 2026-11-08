// The requirements as the worker sends them (#37, #825), for the Civilopedia and the build list to explain.

import { Range, Relation } from '@civ-clone/core-requirement/Requirement';

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
