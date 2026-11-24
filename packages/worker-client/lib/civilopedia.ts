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
import Difficulty from '@civ-clone/core-difficulty/Difficulty';
import { BaseYield } from '@civ-clone/core-unit/Rules/Yield';
import BuildItem from '@civ-clone/core-city-build/BuildItem';
import CityBuild from '@civ-clone/core-city-build/CityBuild';
import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import Game from '@civ-clone/core-game/Game';
import Government from '@civ-clone/core-government/Government';
import Part from '@civ-clone/core-spaceship/Part';
import Player from '@civ-clone/core-player/Player';
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

/** Where a player stands, for the effects that apply to them (#1310): the advances they know and the game's level. */
export interface Situation {
  knows: (AdvanceType: Function) => boolean;
  difficulty: typeof Difficulty | null;
}

// Effects that happen when the player discovers one of their `with` advances: done with once it has.
const onDiscovery: string[] = ['sold_on'];

const classOf = (value: unknown): Function | null =>
  typeof value === 'function' ? value : null;

/**
 * `effects` as they stand in `situation` (#1310), in their order:
 *  - one for another level (`below`, `atLeast`) is left out, and the level dropped from those for this one;
 *  - one over (`until` an advance the player knows, or `sold_on` an advance it knows) is left out;
 *  - one in force says no `from` the player already has;
 *  - one still to come is said only as the next step (its `from` is the `until` of one in force, or of none), without
 *    its own `until`, which is a step further.
 */
export const effectsInForce = (
  effects: Described[],
  { knows, difficulty }: Situation
): Described[] => {
  const level = difficulty?.level() ?? null,
    known = (value: unknown): boolean => {
      const AdvanceType = classOf(value);

      return AdvanceType !== null && knows(AdvanceType);
    },
    atLevel =
      level === null
        ? effects
        : effects
            .filter(
              ({ below, atLeast }) =>
                (classOf(below) === null ||
                  level < (below as typeof Difficulty).level()) &&
                (classOf(atLeast) === null ||
                  level >= (atLeast as typeof Difficulty).level())
            )
            .map(({ below, atLeast, ...effect }) => effect as Described),
    current = atLevel
      .filter(({ until }) => !known(until))
      .flatMap((effect): Described[] => {
        if (!onDiscovery.includes(effect.type) || !Array.isArray(effect.with)) {
          return [effect];
        }

        const unknown = effect.with.filter(
          (AdvanceType: unknown) => !known(AdvanceType)
        );

        return unknown.length === 0 ? [] : [{ ...effect, with: unknown }];
      }),
    future = current.filter(
      ({ from }) => classOf(from) !== null && !known(from)
    ),
    // The steps after the next: their `from` is the `until` of a step still to come.
    later = new Set(future.map(({ until }) => classOf(until))),
    next = future.filter(({ from }) => !later.has(classOf(from)));

  return current
    .filter((effect) => !future.includes(effect) || next.includes(effect))
    .map((effect): Described => {
      // The next step: when it starts, not when it gives way to the one after. In force: when it ends, not when it
      //  started. Each field kept in its place, so an unchanged effect is the same as the one sent with every case.
      const dropped = next.includes(effect)
        ? 'until'
        : known(effect.from)
        ? 'from'
        : null;

      if (dropped !== null) {
        const { [dropped]: _, ...rest } = effect;

        return rest as Described;
      }

      return effect;
    });
};

/**
 * Effects that are the same but for the `squares` they're on, as one on all of them: a Road's trade on Desert, on
 *  Grassland and on Plains is one line.
 */
export const onSquaresTogether = (effects: Described[]): Described[] => {
  const ids = new Map<Function, number>(),
    // A value as the same text whatever order its fields, or a list of classes, came in (#1339): two rules saying the
    //  same line needn't build it alike.
    canonical = (value: unknown): unknown => {
      if (typeof value === 'function') {
        if (!ids.has(value)) {
          ids.set(value, ids.size);
        }

        return `class:${ids.get(value)}`;
      }

      if (Array.isArray(value)) {
        const items = value.map(canonical);

        return items.every(
          (item) => typeof item === 'string' && item.startsWith('class:')
        )
          ? [...items].sort()
          : items;
      }

      if (value !== null && typeof value === 'object') {
        return Object.keys(value)
          .sort()
          .map((field) => [
            field,
            canonical((value as Record<string, unknown>)[field]),
          ]);
      }

      return value;
    },
    keyOf = ({ squares, ...fields }: Described): string =>
      JSON.stringify(canonical(fields)),
    together = new Map<string, Described>();

  effects.forEach((effect: Described): void => {
    const key = keyOf(effect),
      seen = together.get(key);

    if (seen === undefined) {
      together.set(key, { ...effect, squares: [effect.squares] });

      return;
    }

    // The same line from two rules (one describing what it replaces) names its square once.
    if (!(seen.squares as unknown[]).includes(effect.squares)) {
      (seen.squares as unknown[]).push(effect.squares);
    }
  });

  // Each type's lines by their yield, then their value, as the squares' order says nothing: each yield's lines
  //  together (#1339), 2 turns, then 4, then 6, and a line that needs something (a River's road, Bridge Building)
  //  after the one with the same value that doesn't.
  const types = [...new Set(effects.map(({ type }) => type))],
    yields = [...new Set(effects.map(({ yield: yieldType }) => yieldType))],
    valueOf = ({ value }: Described): number =>
      typeof value === 'number' ? value : 0,
    needs = ({ with: needed }: Described): number =>
      needed === undefined ? 0 : 1;

  return [...together.values()].sort(
    (a: Described, b: Described): number =>
      types.indexOf(a.type) - types.indexOf(b.type) ||
      yields.indexOf(a.yield) - yields.indexOf(b.yield) ||
      valueOf(a) - valueOf(b) ||
      needs(a) - needs(b)
  );
};

/**
 * `Item`'s effects among `described`, as they stand in `situation`: those about it, or about one of its base classes,
 *  then those about a square it's the `improvement` on (#1272), as the improvement's own, on those `squares`. A
 *  terrain's yield with a Road says it on the terrain's entry, and on the Road's as the trade it adds there.
 */
export const effectsOf = (
  Item: Class,
  described: Described[],
  entryClasses: Set<Function> = new Set(),
  situation: Situation | null = null
): CivilopediaEffect[] => {
  const inForce = (effects: Described[]): Described[] =>
      situation === null ? effects : effectsInForce(effects, situation),
    about = described
      .filter(
        ({ subject }) =>
          typeof subject === 'function' &&
          (subject === Item || Item.prototype instanceof subject)
      )
      .map(({ subject, ...fields }) => fields as Described),
    // Only for a tile improvement: a Wonder that `acts_as` City Walls names them as its `improvement` too, but isn't a
    //  square they're on. And an effect's `improvement` can be a job with no entry (clearing a forest), which names
    //  no improvement here.
    improving = !(Item.prototype instanceof TileImprovement)
      ? []
      : described.filter(
          ({ subject, improvement }) =>
            // The improvement, or one it's a kind of (#1339): a rule set's own Road is still a Road.
            typeof improvement === 'function' &&
            (improvement === Item ||
              // A function with no prototype (an arrow) can't be a class to be an instance of.
              (typeof improvement.prototype === 'object' &&
                Item.prototype instanceof improvement)) &&
            typeof subject === 'function' &&
            // A square's: a terrain, or one of its base classes (`Land`).
            (subject === Terrain || subject.prototype instanceof Terrain)
        ),
    // Each square's effects as they stand on their own (#1339), so one square's next step can't hide another's, and
    //  then on the squares they're on.
    onSquares = [
      ...new Set(improving.map(({ subject }) => subject as Function)),
    ].flatMap((Square: Function): Described[] =>
      inForce(
        improving
          .filter(({ subject }) => subject === Square)
          .map(({ subject, improvement, ...fields }) => fields as Described)
      ).map((fields) => ({ ...fields, squares: Square } as Described))
    );

  return [...inForce(about), ...onSquaresTogether(onSquares)].map(
    (fields) =>
      effectValue(fields, entryClasses) as unknown as CivilopediaEffect
  );
};

export const civilopediaData = (
  game: Game = defaultGame,
  situation: Situation | null = null
): CivilopediaEntry[] => {
  const kept = new Set(entriesInForce(game.requirements, game.rules)),
    advances = (game.advances.entries() as Class[]).filter(
      (Item) => Item.prototype instanceof Advance
    ) as (typeof Advance)[],
    { ages, ageOf: agesOf } = advanceAges(advances, game.rules),
    described = describedEffects(game.rules),
    // Every class with an entry, and each entry's class by its key, so its effects can say which classes they name
    //  have entries of their own once all are known.
    entryClasses = new Set<Function>(),
    itemOf = new Map<string, Class>(),
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
      itemOf.set(made.key, Item);

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

  // On the entries as sent, some of which are copies with more fields (an advance's age): by key, which is unique.
  all.forEach((made: CivilopediaEntry): void => {
    made.effects = effectsOf(
      itemOf.get(made.key)!,
      described,
      entryClasses,
      situation
    );
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

/** Where `player` stands in `game` (#1310): the advances it has finished researching, and the game's level. */
export const situationOf = (
  player: Player,
  game: Game = defaultGame
): Situation => {
  const research = game.playerResearch.getByPlayer(player);

  return {
    knows: (AdvanceType: Function): boolean =>
      research.completed(AdvanceType as typeof Advance),
    difficulty: game.difficulty.get(),
  };
};

/** The entry with save key `key`'s effects as they stand in `situation` (#1310), or `null` when there's no such entry. */
export const entryEffectsInForce = (
  key: string,
  situation: Situation,
  game: Game = defaultGame
): CivilopediaEffect[] | null =>
  civilopediaData(game, situation).find((entry) => entry.key === key)
    ?.effects ?? null;

export default civilopediaData;
