// The cheats (#449), moved out of `DataTransferClient`: the `cheat` receiver and its five cheats, the lists the cheat
//  menu asks for (`cheatUnitTypes`, `cheatAdvances`, `cheatPlayers`), and the checks that decide whether a
//  `CreateUnit` is acted on and which of a `ModifyUnit`'s fields are, which can be checked with plain data.

import { Gold } from '@civ-clone/civ1-city/Yields';
import Player from '@civ-clone/core-player/Player';
import Unit from '@civ-clone/core-unit/Unit';
import isBarbarian from '@civ-clone/base-civilization-barbarian/isBarbarian';
import Transport, { TransportDisposer } from '../Transport';
import { ClientContext, Registries } from './ClientContext';
import { filterToReference } from './refs';
import answer from '../answer';

export type CheatsContext = Pick<
  ClientContext,
  | 'player'
  | 'patches'
  // What the player may see, which their research, treasury or a unit goes through when a cheat changes it.
  | 'dataFilter'
> &
  Registries<{
    advances: 'entries' | 'filter';
    availableCityBuildItems: 'entries';
    players: 'entries';
    playerResearches: 'getByPlayer';
    playerTreasuries: 'getByPlayerAndType';
    playerWorlds: 'getByPlayer';
    units: 'getBy';
  }>;

export type CreateUnitValue = CheatDataMap['CreateUnit'];

export type ModifyUnitProperties = CheatDataMap['ModifyUnit']['properties'];

export type ModifiableProperty = keyof ModifyUnitProperties;

// The unit type a `CreateUnit` asks for, if it is one the game knows and its square is on the map, or `null`, which
//  the caller treats as "do nothing".
export const validCreateUnit = (
  { unitType, x, y }: Pick<CreateUnitValue, 'unitType' | 'x' | 'y'>,
  world: { width(): number; height(): number },
  unitTypes: (typeof Unit)[]
): typeof Unit | null => {
  const UnitType = unitTypes.find((UnitType) => UnitType.name === unitType);

  if (!UnitType) {
    return null;
  }

  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= world.width() ||
    y >= world.height()
  ) {
    return null;
  }

  return UnitType;
};

// The fields of a unit a `ModifyUnit` sets, in the order they are set: any of these it has, and nothing else.
export const modifiableProperties = (
  properties: ModifyUnitProperties
): [ModifiableProperty, number][] =>
  (
    ['attack', 'defence', 'moves', 'movement', 'visibility'] as (
      | 'attack'
      | 'defence'
      | 'moves'
      | 'movement'
      | 'visibility'
    )[]
  )
    .filter((property) => property in properties)
    .map((property) => [property, properties[property]!]);

// Every unit type the game knows, taken from what cities can be told to build.
export const cheatUnitTypes = (ctx: CheatsContext): (typeof Unit)[] =>
  ctx.availableCityBuildItems
    .entries()
    .filter(
      (Item): Item is typeof Unit =>
        Item === (Unit as unknown) ||
        Object.prototype.isPrototypeOf.call(Unit, Item)
    );

// Resolves a cheat's target: no id means the local player, an id matching a
// registered player means that player (rival or not), and any other id
// means nothing found, which the caller treats as "do nothing".
export const resolveCheatPlayer = (
  ctx: CheatsContext,
  id?: string
): Player | null => {
  if (!id) {
    return ctx.player();
  }

  return ctx.players.entries().find((player) => player.id() === id) ?? null;
};

export const registerCheats = (
  transport: Transport<TransportDataMap>,
  ctx: CheatsContext
): TransportDisposer => {
  const disposers: TransportDisposer[] = [];

  // TODO: These could be `HiddenAction`s. Need to add a `perform` method to actions too...
  disposers.push(
    transport.receive('cheat', ({ name, value }): void => {
      if (name === 'RevealMap') {
        const playerWorld = ctx.playerWorlds.getByPlayer(ctx.player());

        // A bit nasty... I wonder how slow this data transfer will be...
        const [tile] = playerWorld.entries();

        tile
          .tile()
          .map()
          .entries()
          .forEach((tile) => {
            if (playerWorld.includes(tile)) {
              return;
            }

            // Registering raises `player:visibility-changed`, which sends the tile as seeing it would (#342).
            playerWorld.register(tile);
          });
      }

      if (name === 'GrantAdvance') {
        const target = resolveCheatPlayer(ctx, value.player);

        if (!target) {
          return;
        }

        const playerResearch = ctx.playerResearches.getByPlayer(target),
          Advances = ctx.advances.filter(
            (Advance) =>
              value.advances.includes(Advance.name) &&
              !playerResearch.completed(Advance)
          );

        if (Advances.length === 0) {
          return;
        }

        Advances.forEach((Advance) => playerResearch.addAdvance(Advance));

        // Rivals' `PlayerResearch` is never sent to the page, so patching it
        // would leak hidden state and hand the frontend a ref it never
        // received (#46).
        if (target === ctx.player()) {
          ctx.patches.add(
            playerResearch.id(),
            playerResearch.toPlainObject(
              ctx.dataFilter(filterToReference(Player))
            )
          );

          // Granting the advance being researched leaves nothing researched, so Choose Research is due now, not after
          //  the next action (#494).
          ctx.patches.actions();
        }
      }

      if (name === 'GrantGold') {
        const target = resolveCheatPlayer(ctx, value.player);

        if (!target) {
          return;
        }

        const playerTreasury = ctx.playerTreasuries.getByPlayerAndType(
          target,
          Gold
        );

        playerTreasury.add(value.amount);

        // As above: a rival's `PlayerTreasury` stays off the wire (#46).
        if (target === ctx.player()) {
          ctx.patches.add(
            playerTreasury.id(),
            playerTreasury.toPlainObject(
              ctx.dataFilter(filterToReference(Player))
            )
          );

          // What can be bought turns on the gold there is (#494).
          ctx.patches.actions();
        }
      }

      if (name === 'ModifyUnit') {
        const { unitId, properties } = value;

        const [unit] = ctx.units.getBy('id', unitId);

        if (!unit) {
          return;
        }

        modifiableProperties(properties).forEach(([property, amount]) =>
          unit[property]().set(amount)
        );

        // A rival's unit is changed, but nothing is sent: the frontend only holds it as the stand-in the map has for it,
        //  under another id, and a patch keyed by the unit's own would hand it a ref it never had (#494).
        if (unit.player() === ctx.player()) {
          ctx.patches.unit(unit);

          // Moves given or taken make the unit one with something to do, or not (#494).
          ctx.patches.actions();
        }
      }

      if (name === 'CreateUnit') {
        const target = resolveCheatPlayer(ctx, value.player),
          [firstTile] = ctx.playerWorlds.getByPlayer(ctx.player()).entries();

        if (!target || !firstTile) {
          return;
        }

        const world = firstTile.tile().map(),
          UnitType = validCreateUnit(value, world, cheatUnitTypes(ctx));

        if (!UnitType) {
          return;
        }

        // Constructing a unit registers it and emits `unit:created`, which is what sends the unit itself.
        new UnitType(null, target, world.get(value.x, value.y));

        // Our own new unit also needs our actions resent, or it can't be activated until something else resends them.
        if (target === ctx.player()) {
          ctx.patches.actions();
        }
      }

      ctx.patches.flush();
    })
  );

  disposers.push(
    answer(transport, 'cheatUnitTypes', () =>
      cheatUnitTypes(ctx).map((UnitType) => UnitType.name)
    )
  );

  disposers.push(
    answer(transport, 'cheatAdvances', (playerId) => {
      const target = resolveCheatPlayer(ctx, playerId ?? undefined);

      if (!target) {
        return [];
      }

      const playerResearch = ctx.playerResearches.getByPlayer(target);

      // Every advance not yet discovered, prerequisites or not, so a cheat can
      // jump straight to (say) Automobile.
      return ctx.advances
        .entries()
        .filter((Advance) => !playerResearch.completed(Advance))
        .map((Advance) => Advance.name);
    })
  );

  disposers.push(
    // The barbarians (#169) aren't a civilization to play as.
    answer(transport, 'cheatPlayers', () =>
      ctx.players
        .entries()
        .filter((player) => !isBarbarian(player))
        .map((player) => ({
          id: player.id(),
          civilization: player.civilization().sourceClass().name,
          isLocal: player === ctx.player(),
        }))
    )
  );

  return () => disposers.forEach((dispose) => dispose());
};

export default registerCheats;
