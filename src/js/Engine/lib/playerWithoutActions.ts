import {
  AdditionalDataRegistry,
  instance as additionalDataRegistryInstance,
} from '@civ-clone/core-data-object/AdditionalDataRegistry';
import DataObject from '@civ-clone/core-data-object/DataObject';
import Player from '@civ-clone/core-player/Player';
import generateInheritance from '@civ-clone/core-data-object/lib/generateInheritance';

// What a stand-in reports as its class, so that `toPlainObject` finds no additional data for it: see below.
class PlayerWithoutActions {}

const omitted = ['actions', 'mandatoryActions'],
  standIns: WeakMap<Player, Player> = new WeakMap();

// The player serialises as this stand-in without `actions` and `mandatoryActions` (#411), which go on their own,
//  after it, so that an action the frontend already holds goes as a ref (`Client/PlayerPatches.ts` `actions`). In full,
//  every one of them went again with a new id, hundreds in a large game.
//
// As `unitWithoutActions`: each key the stand-in keeps calls the player's own method, and its additional data (its
//  units, cities, research and the rest, which the registries look up by the player itself) is worked out from the
//  player and sent as keys. The stand-in reports a class with no additional data, and `_` and `__` as keys give it the
//  player's class back. Its id is the player's.
export const playerWithoutActions = (
  player: Player,
  additionalDataRegistry: AdditionalDataRegistry = additionalDataRegistryInstance
): Player => {
  const existing = standIns.get(player);

  if (existing) {
    return existing;
  }

  const keys = (player.keys() as string[]).filter(
      (key) => !omitted.includes(key)
    ),
    additionalData = additionalDataRegistry.getByType(player.sourceClass()),
    value = (read: () => unknown) => ({ value: read });

  const standIn: Player = Object.create(player, {
    keys: value(() => [
      '_',
      '__',
      ...keys,
      ...additionalData.map((additionalData) => additionalData.key()),
    ]),
    sourceClass: value(() => PlayerWithoutActions),
    _: value(() => player.sourceClass().name),
    __: value(() => generateInheritance(player as unknown as DataObject)),
    ...Object.fromEntries(
      keys.map((key) => [
        key,
        value(() => {
          const property = (player as any)[key];

          return property instanceof Function
            ? property.call(player)
            : property;
        }),
      ])
    ),
    ...Object.fromEntries(
      additionalData.map((additionalData) => [
        additionalData.key(),
        value(() => additionalData.data(player)),
      ])
    ),
  });

  standIns.set(player, standIn);

  return standIn;
};

export default playerWithoutActions;
