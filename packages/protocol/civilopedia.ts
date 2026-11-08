// The Civilopedia's entries as the worker sends them (#183, #825), and what refuses a city's build item.

export type CivilopediaKind =
  | 'advance'
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
