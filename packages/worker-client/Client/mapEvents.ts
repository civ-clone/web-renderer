// What happens on the map, as it happens (docs/3d-renderer.md §8): a unit's move from one square to the next, and a
//  battle and who won it, for a map that shows them happening. The tile patches that follow say where everything is
//  afterwards; these say what they can't.
//
// A move is a step: a `Move` (capturing a city, embarking, disembarking and landing are `Move`s too) or a `SneakMove`,
//  from one square to another, by a unit that's still there at its end. The engine raises `unit:moved` after nearly
//  every action (founding a city, fortifying, an attack, a GoTo's own after its steps, a Diplomat's mission), and none
//  of those took the unit anywhere new. Some steps raise it twice with the same action (`Embark` and `LandAircraft` run
//  `Moved` after `Move`'s own): each is sent once. A ship's cargo steps after it, each carried unit sent on its own,
//  after the ship's.
//
// Sent when the player can see it happen, as Civ1 shows it, and as a battle's sound is heard (`battleEvents.ts`): the
//  player's own units' always; anyone else's when both squares are ones the player knows and one of the player's units
//  has either in sight; everything to a watcher of the whole map, who knows every square. Sent as the engine raises
//  the event, so before the flush that sends its squares (`events/patchEvents.ts` flushes on `unit:moved`, and is
//  registered after this).
//
// The units are named as the page holds them, through the client's data filter: a rival's by the stand-in it goes as.

import Action from '@civ-clone/core-unit/Action';
import Engine from '@civ-clone/core-engine/Engine';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { ClientContext, Disposer } from './ClientContext';
import { MapEventSquare, MapEventUnit } from '@civ-clone/ui-protocol/mapEvents';
import { Move } from '@civ-clone/library-unit/Actions/Move';
import { SneakMove } from '@civ-clone/library-unit/Actions/SneakMove';

export type MapEventsContext = Pick<
  ClientContext,
  'view' | 'transport' | 'units' | 'dataFilter'
>;

const square = (tile: Tile): MapEventSquare => ({ x: tile.x(), y: tile.y() });

/** `unit` as the page holds it, standing on `tile`. */
export const mapEventUnit = (
  unit: Unit,
  tile: Tile,
  ctx: Pick<MapEventsContext, 'dataFilter'>
): MapEventUnit => {
  const filter = ctx.dataFilter(),
    sent = filter(unit) as unknown as { id(): string },
    player = filter(unit.player()) as unknown as { id(): string };

  return {
    id: sent.id(),
    type: unit.constructor.name,
    player: player.id(),
    tile: square(tile),
  };
};

// No unit sees further than two squares in Civ1 or Civ2 (civ1-unit's and civ2-unit's yields): three leaves room for a
//  modifier. Only the player's units this close to a square are asked whether they see it.
const SIGHT_REACH = 3;

/**
 * Whether one of the player's units has any of `tiles` in sight now, as `battleEvents.ts`'s `inSight` says, asking only
 *  the units within `SIGHT_REACH` of them: a rival's step far from the player's units costs a few lookups, not a look
 *  round from every unit the player has.
 */
const inSightOfAny = (
  tiles: Tile[],
  ctx: Pick<MapEventsContext, 'view' | 'units'>
): boolean => {
  const asked = new Set<Unit>();

  return tiles.some((tile) =>
    tile
      .getSurroundingArea(SIGHT_REACH)
      .entries()
      .some((square: Tile) =>
        ctx.units.getByTile(square).some((unit: Unit) => {
          if (asked.has(unit) || !ctx.view.owns(unit.player())) {
            return false;
          }

          asked.add(unit);

          const sight = unit
            .tile()
            .getSurroundingArea(unit.visibility().value());

          return tiles.some((seenTile) => sight.includes(seenTile));
        })
      )
  );
};

/**
 * Whether the player sees something `unit` does between `tiles`: always, for the player's own units, and for a watcher
 *  of the whole map (a view with no players of its own); otherwise, only between squares the player knows, one of them
 *  in sight. Squares known is the cheap test, so it comes first.
 */
const seen = (
  unit: Unit,
  tiles: Tile[],
  ctx: Pick<MapEventsContext, 'view' | 'units'>
): boolean =>
  ctx.view.owns(unit.player()) ||
  ctx.view.owners().length === 0 ||
  (tiles.every((tile) => ctx.view.tile(tile) !== null) &&
    inSightOfAny(tiles, ctx));

/** Whether `action` took `unit` a step, to where it is now. */
const stepped = (unit: Unit, action: Action): boolean =>
  (action instanceof Move || action instanceof SneakMove) &&
  action.from() !== action.to() &&
  !unit.destroyed() &&
  unit.tile() === action.to();

export const registerMapEvents = (
  engine: Pick<Engine, 'on' | 'off'>,
  ctx: MapEventsContext
): Disposer => {
  // Each is told inside the engine's move or attack, which a failure here would stop: an event not told only goes
  //  unanimated, as a battle not heard is only quiet (`battleEvents.ts`).
  const safely =
      <Args extends unknown[]>(tell: (...args: Args) => void) =>
      (...args: Args): void => {
        try {
          tell(...args);
        } catch (error) {
          console.error(error);
        }
      },
    // Each step once, however often it's raised.
    sentSteps = new WeakSet<Action>(),
    moved = safely((unit: Unit, action: Action): void => {
      const from = action.from(),
        to = action.to();

      if (
        sentSteps.has(action) ||
        !stepped(unit, action) ||
        !seen(unit, [from, to], ctx)
      ) {
        return;
      }

      sentSteps.add(action);

      ctx.transport.send('mapEvent', {
        kind: 'moved',
        unit: mapEventUnit(unit, from, ctx),
        from: square(from),
        to: square(to),
      });
    }),
    // `unit:defeated` can be raised twice for a defeat (civ2-city's rule beside civ2-unit's, as `battleEvents.ts` says):
    //  a battle is sent once.
    told = new WeakSet<Unit>(),
    defeated = safely((loser: Unit, winner: Unit, action?: Action): void => {
      if (!action || told.has(loser)) {
        return;
      }

      const attacker = action.unit();

      // Not a battle: a unit defeated some other way.
      if (attacker !== loser && attacker !== winner) {
        return;
      }

      const defender = attacker === loser ? winner : loser;

      if (
        !ctx.view.owns(defender.player()) &&
        !seen(attacker, [attacker.tile(), defender.tile()], ctx)
      ) {
        return;
      }

      told.add(loser);

      ctx.transport.send('mapEvent', {
        kind: 'battle',
        attacker: mapEventUnit(attacker, attacker.tile(), ctx),
        defender: mapEventUnit(defender, defender.tile(), ctx),
        winner: attacker === winner ? 'attacker' : 'defender',
      });
    });

  engine.on('unit:moved', moved);
  engine.on('unit:defeated', defeated);

  return (): void => {
    engine.off('unit:moved', moved);
    engine.off('unit:defeated', defeated);
  };
};

export default registerMapEvents;
