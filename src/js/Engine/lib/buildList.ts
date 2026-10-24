// The production picker's sections (#432) and a unit's numbers on its line (#381), worked out here so the picker
//  knows no rules (#274): which section an item belongs to is its class's, and a unit's numbers come from the ruleset.

import { CivilopediaKind, UnitStats, kindOf, unitStats } from './civilopedia';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';

export type BuildGroup = Extract<
  CivilopediaKind,
  'unit' | 'improvement' | 'spaceship' | 'wonder'
>;

/** The sections, in the order the picker shows them. */
export const buildGroups: BuildGroup[] = [
  'unit',
  'improvement',
  'spaceship',
  'wonder',
];

export interface BuildListDetails {
  /** The item's section, or `null` for an item no section is for. */
  group: BuildGroup | null;
  /** A unit's attack, defence, movement and visibility; `null` for anything else. */
  stats: UnitStats | null;
}

type Class = Function & { name: string };

const groupOf = (Item: Class): BuildGroup | null => {
  const kind = kindOf(Item);

  return buildGroups.includes(kind as BuildGroup) ? (kind as BuildGroup) : null;
};

const rank = (Item: Class): number => {
  const group = groupOf(Item);

  return group === null ? buildGroups.length : buildGroups.indexOf(group);
};

/** `items` by section, each section in the order it was given in. */
export const inBuildListOrder = <T>(
  items: T[],
  itemOf: (item: T) => Class
): T[] =>
  items
    .map((item, index) => ({ item, index, rank: rank(itemOf(item)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);

export const buildListDetails = (
  Item: Class,
  rules: RuleRegistry
): BuildListDetails => {
  const group = groupOf(Item);

  return {
    group,
    stats: group === 'unit' ? unitStats(Item, rules) : null,
  };
};
