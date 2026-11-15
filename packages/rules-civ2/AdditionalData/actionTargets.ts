import Action from '@civ-clone/core-unit/Action';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
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
import { instance as tileImprovementRegistryInstance } from '@civ-clone/core-tile-improvement/TileImprovementRegistry';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

// The orders Civ2 gives to a distant square (M2b, #1007): Paradrop, anywhere within @COSMIC's range, and Airlift, to
//  another of the player's cities. The engine offers an action for any square it's asked about, and the client asks
//  only about the unit's own and its neighbours, so these say which distant squares the engine offers each for.
//  `unitWithoutActions` leaves the key out of every unit but the one the UI has the actions of, as it does `actions`.

/** The squares among `candidates` that `unit` is offered an `ActionType` for. */
const offered = (
  unit: Unit,
  candidates: Tile[],
  ActionType: typeof Action
): string[] =>
  candidates
    .filter((tile: Tile): boolean =>
      unit.actions(tile).some((action: Action) => action instanceof ActionType)
    )
    .map((tile: Tile): string => tile.id());

/** Where `unit` can paradrop: only asked of a unit that can, with all its moves, as the engine's first tests are. */
const paradropTargets = (unit: Unit): string[] => {
  if (
    !unit.hasTrait(ParadropTrait) ||
    unit.moves().value() < unit.movement().value()
  ) {
    return [];
  }

  const from = unit.tile();

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
    Paradrop
  );
};

/** The player's other cities `unit` can be airlifted to, asked only of a unit in one of its player's cities. */
const airliftTargets = (unit: Unit): string[] => {
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
    Airlift
  );
};

/** Each distant order's squares, by the action's name, or `null` when there are none. */
export const actionTargets = (): AdditionalData =>
  new AdditionalData(
    Unit,
    'actionTargets',
    (unit: Unit): { [action: string]: string[] } | null => {
      const targets = Object.fromEntries(
        (
          [
            ['Paradrop', paradropTargets(unit)],
            ['Airlift', airliftTargets(unit)],
          ] as [string, string[]][]
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
