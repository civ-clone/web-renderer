// The civilopedia's entries (#183): every advance, age (#1076), unit, city improvement, Wonder, government, spaceship
//  part, tile improvement and terrain the game knows, each with the requirement entries (#37) that apply to it and
//  those it is a target of, by the ids `getRequirements` sends. Worked out here, from the game's registries and rules,
//  so the page knows no rules: which entries apply through a base class (`Naval`, `CityImprovement`) is the registry's
//  own walk, and a unit's numbers and an item's cost come from the ruleset's rules. Definitions, the same for every
//  player.

import {
  Attack,
  Defence,
  Movement,
  Visibility,
} from '@civ-clone/core-unit/Yields';
import Advance from '@civ-clone/core-science/Advance';
import Age from '@civ-clone/base-science-age/Age';
import { BaseYield } from '@civ-clone/core-unit/Rules/Yield';
import BuildItem from '@civ-clone/core-city-build/BuildItem';
import CityBuild from '@civ-clone/core-city-build/CityBuild';
import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import Game from '@civ-clone/core-game/Game';
import Government from '@civ-clone/core-government/Government';
import Part from '@civ-clone/core-spaceship/Part';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';
import { Requirement } from '@civ-clone/core-requirement/Requirement';
import Terrain from '@civ-clone/core-terrain/Terrain';
import TileImprovement from '@civ-clone/core-tile-improvement/TileImprovement';
import Unit from '@civ-clone/core-unit/Unit';
import Wonder from '@civ-clone/core-wonder/Wonder';
import Yield from '@civ-clone/core-yield/Yield';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { ageOf } from '@civ-clone/base-science-age/lib/ageOf';
import { entriesInForce } from './requirements';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import {
  CivilopediaClass,
  CivilopediaEffect,
  CivilopediaEffectValue,
  CivilopediaKind,
  CivilopediaEntry,
  UnitStats,
  UnavailableBuildItem,
} from '@civ-clone/ui-protocol/civilopedia';

type Class = Function & { name: string; type?: string };

// Wonder before improvement, as a Wonder is a `CityImprovement`.
const kinds: [CivilopediaKind, Class][] = [
  ['wonder', Wonder],
  ['improvement', CityImprovement],
  ['spaceship', Part],
  ['unit', Unit],
];

export const kindOf = (Item: Class): CivilopediaKind | null =>
  kinds.find(([, Base]) => Item.prototype instanceof Base)?.[0] ?? null;

// Those in force, as `requirementsData` sends them: an entry left out there must not be named here.
const ids = (entries: Requirement[], kept: Set<Requirement>): string[] =>
  entries
    .filter((entry: Requirement): boolean => kept.has(entry))
    .map((entry: Requirement): string => entry.id);

// A rule a plugin wrote for a city may not expect to be asked without one: the item then shows no cost.
const costOf = (Item: Class, game: Game): number | null => {
  try {
    const cost = new BuildItem(Item as any, null, game.rules).cost().value();

    return Number.isFinite(cost) ? cost : null;
  } catch {
    return null;
  }
};

const baseYield = (
  UnitType: Class,
  YieldType: typeof Yield,
  rules: RuleRegistry
) => {
  const unitYield = new YieldType();

  rules.process(BaseYield, UnitType as typeof Unit, unitYield);

  return unitYield.value();
};

/** A unit's numbers before anything modifies them, from the ruleset's `BaseYield` rules. */
export const unitStats = (UnitType: Class, rules: RuleRegistry): UnitStats => ({
  attack: baseYield(UnitType, Attack, rules),
  defence: baseYield(UnitType, Defence, rules),
  movement: baseYield(UnitType, Movement, rules),
  visibility: baseYield(UnitType, Visibility, rules),
});

/**
 * Under rules with ages (#1076), each advance's age, and the ages in order, from the ruleset's `AgeOf` rules: an advance
 *  known alone puts a civilization in its own age, and two advances known together in the later of their two ages.
 *  An advance that can be repeated belongs to none. With no ages, or with them switched off, there are none.
 */
export const advanceAges = (
  advances: (typeof Advance)[],
  rules: RuleRegistry
): { ages: (typeof Age)[]; ageOf: Map<typeof Advance, typeof Age> } => {
  const of = new Map<typeof Advance, typeof Age>();

  advances
    .filter((AdvanceType: typeof Advance): boolean => !AdvanceType.repeatable)
    .forEach((AdvanceType: typeof Advance): void => {
      const age = ageOf([AdvanceType], rules);

      if (age !== null) {
        of.set(AdvanceType, age);
      }
    });

  // One advance of each age stands for it.
  const advanceOf = new Map<typeof Age, typeof Advance>();

  of.forEach((AgeType: typeof Age, AdvanceType: typeof Advance): void => {
    if (!advanceOf.has(AgeType)) {
      advanceOf.set(AgeType, AdvanceType);
    }
  });

  const ages = [...advanceOf.keys()].sort((a: typeof Age, b: typeof Age) =>
    a === b
      ? 0
      : ageOf([advanceOf.get(a)!, advanceOf.get(b)!], rules) === b
      ? -1
      : 1
  );

  return { ages, ageOf: of };
};

// A described value as the page is sent it: a class by its key and name, and whether it is the class an entry is about
//  (`entry`): keys can be shared across kinds (the Trade yield and the Trade advance are both `Trade`), so a key alone
//  can't say that. Lists and records the same all the way down.
const effectValue = (
  value: unknown,
  entryClasses: Set<Function> = new Set()
): CivilopediaEffectValue => {
  if (typeof value === 'function') {
    return {
      class: typeNameOf(value as Class),
      name: (value as Class).name,
      entry: entryClasses.has(value),
    } as CivilopediaClass;
  }

  if (Array.isArray(value)) {
    return value.map((item) => effectValue(item, entryClasses));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([field, item]) => [
        field,
        effectValue(item, entryClasses),
      ])
    );
  }

  return value as CivilopediaEffectValue;
};

type Described = { type: string; subject?: unknown; [field: string]: unknown };

/**
 * What the rules in force say they do (#1196), by what each effect is about (its `subject`): a rule switched off, by a
 *  rule set or one that supersedes it, says nothing. A rule from a copy of `core-rule` without descriptions has none.
 */
export const describedEffects = (rules: RuleRegistry): Described[] =>
  rules
    .entries()
    .filter((rule) => rule.enabled())
    .flatMap(
      (rule) =>
        ((rule as { descriptions?: () => Described[] }).descriptions?.() ??
          []) as Described[]
    );

/** `Item`'s effects among `described`: those about it, or about one of its base classes. */
export const effectsOf = (
  Item: Class,
  described: Described[],
  entryClasses: Set<Function> = new Set()
): CivilopediaEffect[] =>
  described
    .filter(
      ({ subject }) =>
        typeof subject === 'function' &&
        (subject === Item || Item.prototype instanceof subject)
    )
    .map(
      ({ subject, ...fields }) =>
        effectValue(fields, entryClasses) as unknown as CivilopediaEffect
    );

export const civilopediaData = (
  game: Game = defaultGame
): CivilopediaEntry[] => {
  const kept = new Set(entriesInForce(game.requirements, game.rules)),
    advances = (game.advances.entries() as Class[]).filter(
      (Item) => Item.prototype instanceof Advance
    ) as (typeof Advance)[],
    { ages, ageOf: agesOf } = advanceAges(advances, game.rules),
    described = describedEffects(game.rules),
    // Every class with an entry, and each entry with its class, so its effects can say which classes they name have
    //  entries of their own once all are known.
    entryClasses = new Set<Function>(),
    entered: [CivilopediaEntry, Class][] = [],
    entry = (
      Item: Class,
      kind: CivilopediaKind,
      buildable: boolean = false
    ): CivilopediaEntry => {
      const made: CivilopediaEntry = {
        key: typeNameOf(Item),
        name: Item.name,
        kind,
        requires: ids(game.requirements.for(Item as any), kept),
        leadsTo: ids(game.requirements.leadsTo(Item as any), kept),
        cost: buildable ? costOf(Item, game) : null,
        stats: kind === 'unit' ? unitStats(Item, game.rules) : null,
        effects: [],
      };

      entryClasses.add(Item);
      entered.push([made, Item]);

      return made;
    };

  const all: CivilopediaEntry[] = [
    ...advances.map((AdvanceType) => {
      const age = agesOf.get(AdvanceType);

      return {
        ...entry(AdvanceType, 'advance'),
        ...(age === undefined ? {} : { age: typeNameOf(age) }),
      };
    }),
    ...ages.map(
      (AgeType: typeof Age, order: number): CivilopediaEntry => ({
        ...entry(AgeType, 'age'),
        advances: advances
          .filter((AdvanceType) => agesOf.get(AdvanceType) === AgeType)
          .map((AdvanceType) => typeNameOf(AdvanceType)),
        order,
      })
    ),
    ...(game.availableCityBuildItems.entries() as Class[]).flatMap((Item) => {
      const kind = kindOf(Item);

      return kind === null ? [] : [entry(Item, kind, true)];
    }),
    ...(game.availableGovernments.entries() as Class[])
      .filter((Item) => Item.prototype instanceof Government)
      .map((Item) => entry(Item, 'government')),
    ...(game.availableTileImprovements.entries() as Class[])
      .filter((Item) => Item.prototype instanceof TileImprovement)
      .map((Item) => entry(Item, 'tileImprovement')),
    ...(game.terrains.entries() as Class[])
      .filter((Item) => Item.prototype instanceof Terrain)
      .map((Item) => entry(Item, 'terrain')),
  ];

  entered.forEach(([made, Item]): void => {
    made.effects = effectsOf(Item, described, entryClasses);
  });

  return all;
};

/**
 * What `cityBuild`'s city can't build, and why (#37 step 9): the rules' ids, which a requirement entry shares when the
 *  rule was made from one or is described by one. Unnamed rules give no reason, so they are left out.
 */
export const unavailableBuildItems = (
  cityBuild: CityBuild
): UnavailableBuildItem[] =>
  cityBuild.unavailable().map(({ item, refusedBy }) => ({
    key: typeNameOf(item as unknown as Class),
    name: (item as unknown as Class).name,
    refusedBy: refusedBy.filter((id): id is string => id !== null),
  }));

export default civilopediaData;
