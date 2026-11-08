import {
  AdditionalDataRegistry,
  instance as additionalDataRegistryInstance,
} from '@civ-clone/core-data-object/AdditionalDataRegistry';
import DataObject from '@civ-clone/core-data-object/DataObject';
import Player from '@civ-clone/core-player/Player';
import generateInheritance from '@civ-clone/core-data-object/lib/generateInheritance';

// What a stand-in reports as its class, so that `toPlainObject` finds no additional data for it: see below.
class PlayerStandIn {}

export type PlayerStandInOptions = {
  // Keys of the player left out of the stand-in, to go on their own.
  omit?: string[];
  // Additional data of the player given another value, such as a view's own `world` (#613).
  data?: { [key: string]: () => unknown };
};

/**
 * A player serialised as something other than itself: without some of its keys, or with some of its additional data
 * replaced. Each key the stand-in keeps calls the player's own method, and its additional data (its units, cities,
 * research and the rest, which the registries look up by the player itself) is worked out from the player and sent as
 * keys, unless given here. The stand-in reports a class with no additional data, and `_` and `__` as keys give it the
 * player's class back. Its id is the player's.
 */
export const playerStandIn = (
  player: Player,
  { omit = [], data = {} }: PlayerStandInOptions = {},
  additionalDataRegistry: AdditionalDataRegistry = additionalDataRegistryInstance
): Player => {
  const keys = (player.keys() as string[]).filter((key) => !omit.includes(key)),
    additionalData = additionalDataRegistry.getByType(player.sourceClass()),
    value = (read: () => unknown) => ({ value: read });

  return Object.create(player, {
    keys: value(() => [
      '_',
      '__',
      ...keys,
      ...additionalData.map((additionalData) => additionalData.key()),
    ]),
    sourceClass: value(() => PlayerStandIn),
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
        value(
          data[additionalData.key()] ?? (() => additionalData.data(player))
        ),
      ])
    ),
  });
};

export default playerStandIn;
