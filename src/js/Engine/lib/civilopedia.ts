// The civilopedia's entries (#183): every advance, unit, city improvement, Wonder, government, spaceship part, tile
//  improvement and terrain the game knows, each with the requirement entries (#37) that apply to it and those it is a
//  target of, by the ids `getRequirements` sends. Worked out here, from the game's registries and rules, so the page
//  knows no rules: which entries apply through a base class (`Naval`, `CityImprovement`) is the registry's own walk,
//  and a unit's numbers and an item's cost come from the ruleset's rules. Definitions, the same for every player.

import { Attack, Defence, Movement } from '@civ-clone/core-unit/Yields';
import Advance from '@civ-clone/core-science/Advance';
import { BaseYield } from '@civ-clone/core-unit/Rules/Yield';
import BuildItem from '@civ-clone/core-city-build/BuildItem';
import CityBuild from '@civ-clone/core-city-build/CityBuild';
import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import Game from '@civ-clone/core-game/Game';
import Government from '@civ-clone/core-government/Government';
import Part from '@civ-clone/core-spaceship/Part';
import { Requirement } from '@civ-clone/core-requirement/Requirement';
import Terrain from '@civ-clone/core-terrain/Terrain';
import TileImprovement from '@civ-clone/core-tile-improvement/TileImprovement';
import Unit from '@civ-clone/core-unit/Unit';
import Wonder from '@civ-clone/core-wonder/Wonder';
import Yield from '@civ-clone/core-yield/Yield';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

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
  /** A unit's attack, defence and movement before anything modifies them. */
  stats: { attack: number; defence: number; movement: number } | null;
}

type Class = Function & { name: string; type?: string };

// Wonder before improvement, as a Wonder is a `CityImprovement`.
const kinds: [CivilopediaKind, Class][] = [
  ['wonder', Wonder],
  ['improvement', CityImprovement],
  ['spaceship', Part],
  ['unit', Unit],
];

const kindOf = (Item: Class): CivilopediaKind | null =>
  kinds.find(([, Base]) => Item.prototype instanceof Base)?.[0] ?? null;

const ids = (entries: Requirement[]): string[] =>
  entries.map((entry: Requirement): string => entry.id);

// A rule a plugin wrote for a city may not expect to be asked without one: the item then shows no cost.
const costOf = (Item: Class, game: Game): number | null => {
  try {
    const cost = new BuildItem(Item as any, null, game.rules).cost().value();

    return Number.isFinite(cost) ? cost : null;
  } catch {
    return null;
  }
};

const baseYield = (UnitType: Class, YieldType: typeof Yield, game: Game) => {
  const unitYield = new YieldType();

  game.rules.process(BaseYield, UnitType as typeof Unit, unitYield);

  return unitYield.value();
};

export const civilopediaData = (
  game: Game = defaultGame
): CivilopediaEntry[] => {
  const entry = (
    Item: Class,
    kind: CivilopediaKind,
    buildable: boolean = false
  ): CivilopediaEntry => ({
    key: typeNameOf(Item),
    name: Item.name,
    kind,
    requires: ids(game.requirements.for(Item as any)),
    leadsTo: ids(game.requirements.leadsTo(Item as any)),
    cost: buildable ? costOf(Item, game) : null,
    stats:
      kind === 'unit'
        ? {
            attack: baseYield(Item, Attack, game),
            defence: baseYield(Item, Defence, game),
            movement: baseYield(Item, Movement, game),
          }
        : null,
  });

  return [
    ...(game.advances.entries() as Class[])
      .filter((Item) => Item.prototype instanceof Advance)
      .map((Item) => entry(Item, 'advance')),
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
};

/** An item a city can't build, by its save key and class name, with the ids of the rules that refuse it. */
export interface UnavailableBuildItem {
  key: string;
  name: string;
  refusedBy: string[];
}

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
