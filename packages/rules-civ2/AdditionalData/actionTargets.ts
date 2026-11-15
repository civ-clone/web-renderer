import Action from '@civ-clone/core-unit/Action';
import ActionRule from '@civ-clone/core-unit/Rules/Action';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import { Airbase } from '@civ-clone/civ2-world/TileImprovements';
import Airlift from '@civ-clone/base-unit-action-airlift/Airlift';
import City from '@civ-clone/core-city/City';
import Paradrop from '@civ-clone/base-unit-action-paradrop/Paradrop';
import ParadropTrait from '@civ-clone/base-unit-trait-paradrop/Paradrop';
import Pillage from '@civ-clone/base-unit-action-pillage/Pillage';
import Tile from '@civ-clone/core-world/Tile';
import TileImprovement from '@civ-clone/core-tile-improvement/TileImprovement';
import Unit from '@civ-clone/core-unit/Unit';
import { cosmic } from '@civ-clone/civ2-rules/data/cosmic';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import distance from '@civ-clone/civ2-unit/lib/distance';
import { pillageable } from '@civ-clone/civ2-unit/Rules/Unit/action';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as tileImprovementRegistryInstance } from '@civ-clone/core-tile-improvement/TileImprovementRegistry';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

// The orders Civ2 gives to a distant square (M2b, #1007): Paradrop, anywhere within @COSMIC's range, and Airlift, to
//  another of the player's cities. The engine offers an action for any square it's asked about, and the client asks
//  only about the unit's own and its neighbours, so these say which distant squares the engine offers each for.
//  `unitWithoutActions` leaves the key out of every unit but the one the UI has the actions of, as it does `actions`.
//  They go as the squares themselves, so the client's filter sends each as the player's own square (a `PlayerTile`
//  ref), as it does an action's `to`: the engine's tile ids aren't the ones the client knows.

/**
 * The squares among `candidates` that `unit` is offered an `ActionType` for. Asking only civ2-unit's own rule for it
 *  (`<prefix>:unit/action/<name>`, base-unit-action-rules' `actionId`), whose criteria decide whether the engine offers
 *  it, rather than every action rule for every square, which took most of a second for a paradrop's few hundred. All
 *  of them, as the engine is asked, if the rule isn't there under that id.
 */
const offered = (
  unit: Unit,
  candidates: Tile[],
  name: string,
  ActionType: typeof Action
): Tile[] => {
  const rule = ruleRegistryInstance.getById(`civ2-unit:unit/action/${name}`),
    from = unit.tile(),
    offers: (tile: Tile) => boolean =
      rule instanceof ActionRule
        ? (tile) => rule.validate(unit, tile, from)
        : (tile) =>
            unit
              .actions(tile)
              .some((action: Action) => action instanceof ActionType);

  return candidates.filter(offers);
};

/**
 * Where `unit` can paradrop: only asked of a unit that can, with all its moves, in a city or on an airbase, as the
 *  engine's first tests are, so a unit that can't drop costs nothing.
 */
const paradropTargets = (unit: Unit): Tile[] => {
  const from = unit.tile();

  if (
    !unit.hasTrait(ParadropTrait) ||
    unit.moves().value() < unit.movement().value() ||
    (cityRegistryInstance.getByTile(from) === null &&
      !tileImprovementRegistryInstance
        .getByTile(from)
        .some((improvement: TileImprovement) => improvement instanceof Airbase))
  ) {
    return [];
  }

  // Only the land within range is worth asking about: the engine asks the same, and more.
  return offered(
    unit,
    from
      .map()
      .tiles()
      .filter(
        (tile: Tile): boolean =>
          tile !== from &&
          tile.isLand() &&
          distance(from, tile) <= cosmic.paradropRange
      ),
    'paradrop',
    Paradrop
  );
};

/** The player's other cities `unit` can be airlifted to, asked only of a unit in one of its player's cities. */
const airliftTargets = (unit: Unit): Tile[] => {
  const city = cityRegistryInstance.getByTile(unit.tile());

  if (city === null || city.player() !== unit.player()) {
    return [];
  }

  return offered(
    unit,
    cityRegistryInstance
      .getByPlayer(unit.player())
      .filter((other: City): boolean => other !== city)
      .map((other: City): Tile => other.tile()),
    'airlift',
    Airlift
  );
};

/** Each distant order's squares, by the action's name, or `null` when there are none. */
export const actionTargets = (): AdditionalData =>
  new AdditionalData(
    Unit,
    'actionTargets',
    (unit: Unit): { [action: string]: Tile[] } | null => {
      const targets = Object.fromEntries(
        (
          [
            ['Paradrop', paradropTargets(unit)],
            ['Airlift', airliftTargets(unit)],
          ] as [string, Tile[]][]
        ).filter(([, tiles]) => tiles.length > 0)
      );

      return Object.keys(targets).length > 0 ? targets : null;
    }
  );

/**
 * What Pillage can take from its square (civ2-unit's `pillageable`, in the order the square lists them), by type name,
 *  so the player can choose when there's more than one: the engine pillages the one chosen (base-unit-action-pillage's
 *  `perform(target)`). Sneak Pillage is a Pillage too.
 */
export const pillageTargets = (): AdditionalData =>
  new AdditionalData(Pillage, 'targets', (action: Pillage): string[] =>
    tileImprovementRegistryInstance
      .getByTile(action.to())
      .filter((improvement: TileImprovement): boolean =>
        pillageable(improvement)
      )
      .map((improvement: TileImprovement): string =>
        typeNameOf(improvement.sourceClass())
      )
  );
