// The Civilopedia's entries as the worker sends them (#183, #825), and what refuses a city's build item.

export type CivilopediaKind =
  | 'advance'
  | 'age'
  | 'unit'
  | 'improvement'
  | 'wonder'
  | 'government'
  | 'spaceship'
  | 'tileImprovement'
  | 'terrain';

export interface CivilopediaEntry {
  /** The save key (`RailroadAdvance`), as requirement entries name their classes: unique across kinds. */
  key: string;
  /** The class name (`Railroad`), which the translations use. */
  name: string;
  kind: CivilopediaKind;
  /** The requirement entries about it, its own and its base classes', in the order they were added. */
  requires: string[];
  /** The requirement entries it is a target of. */
  leadsTo: string[];
  /** What a city pays to build it, or `null` for what isn't built in a city. */
  cost: number | null;
  /** A unit's attack, defence, movement and visibility before anything modifies them. */
  stats: UnitStats | null;
  /** An advance's age, by the age's key, under rules with ages (#1076). */
  age?: string;
  /** An age's advances, by their keys (#1076). */
  advances?: string[];
  /** An age's place among the ages, from 0 (#1076). */
  order?: number;
  /**
   * What it does, as the rules in force describe it (#1196): each effect whose `subject` is this or one of its base
   *  classes, in the rules' order. The page says each in words by its `type`.
   */
  effects: CivilopediaEffect[];
}

/**
 * A class an effect names (a yield, an advance, a unit improvement), by its save key, as `requires` names classes, and
 *  its class name, which the translations use.
 */
export interface CivilopediaClass {
  class: string;
  name: string;
}

export type CivilopediaEffectValue =
  | string
  | number
  | boolean
  | null
  | CivilopediaClass
  | CivilopediaEffectValue[]
  | { [field: string]: CivilopediaEffectValue };

/** One effect, as a rule describes it (`@civ-clone/core-rule/Description`): its `type` says what its fields mean. */
export interface CivilopediaEffect {
  type: string;
  [field: string]: CivilopediaEffectValue;
}

export interface UnitStats {
  attack: number;
  defence: number;
  movement: number;
  visibility: number;
}

/** An item a city can't build, by its save key and class name, with the ids of the rules that refuse it. */
export interface UnavailableBuildItem {
  key: string;
  name: string;
  refusedBy: string[];
}
