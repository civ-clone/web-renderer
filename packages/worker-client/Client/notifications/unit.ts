// What the client tells the player about units (#449), moved out of `DataTransferClient`. What these events change
//  goes out as patches, which the client queues itself, before these.

import Action from '@civ-clone/core-unit/Action';
import City from '@civ-clone/core-city/City';
import GoodyHut from '@civ-clone/core-goody-hut/GoodyHut';
import { NotificationContext, NotificationTable } from './NotificationContext';
import Notification from '@civ-clone/ui-protocol/Notification';
import Player from '@civ-clone/core-player/Player';
import Unit from '@civ-clone/core-unit/Unit';
import { workerRules } from '../../workerRules';

// How much a hut's outcome gave, for one that says (its gold, by `amount()`): the action itself is a plain object, sent
//  field by field, so the notice is given the figure rather than reading the action's own.
const amountOf = (action: object): { amount?: number } => {
  const { amount } = action as { amount?: unknown },
    value: unknown = typeof amount === 'function' ? amount.call(action) : null;

  return typeof value === 'number' ? { amount: value } : {};
};

// Nuclear attacks a missile defence stopped (M2b): the engine says so (`unit:nuclear-stopped`) just before it tells of
//  the detonation, which is then told as stopped, not as nuclear weapons used.
const stoppedNuclearAttacks = new WeakSet<Unit>(),
  // The attack each unit last won (`unit:defeated`), and the attacks a shrinking city has been told of: one notice for
  //  the defender lost, however many of the rules shrink the city for it, by the attack or by the unit that won it.
  lastWin = new WeakMap<Unit, Action>(),
  toldShrinks = new WeakSet<Action>();
// These are the module's, so every client in the worker shares them. That's sound as they stand: they record engine
//  events, which are the same for every client, and only a client that owns the city reaches `toldShrinks`, so a
//  second client's notice isn't lost to the first's. A client that could own a city another also owns (an observer of
//  several players) would need them keyed by client.

// The attack a city shrank for (`city:shrink`'s cause), if it shrank because its defender lost one: the attack itself, or
//  the unit that won it, as the rules give it. `null` for any other cause (famine, a nuclear detonation, Settlers built).
const lostDefence = (city: City, cause: unknown): Action | null => {
  const attack =
    cause instanceof Action
      ? cause
      : cause instanceof Unit
      ? lastWin.get(cause) ?? null
      : null;

  return attack !== null &&
    attack.to() === city.tile() &&
    attack.unit().player() !== city.player()
    ? attack
    : null;
};

export const unitNotifications: NotificationTable = [
  // A nuclear detonation (#129), told to everyone but the player who set it off. One a missile defence stopped is
  //  told as that (`unit:nuclear-stopped`) instead.
  [
    'unit:nuclear-detonation',
    (ctx: NotificationContext, unit: Unit) =>
      ctx.view.owns(unit.player()) || stoppedNuclearAttacks.has(unit)
        ? null
        : new Notification('Unit.nuclear-attack', {
            player: unit.player(),
          }),
  ],

  // A nuclear attack a missile defence (Civ2's SDI Defense) stopped, the missile lost (M2b): told to the player whose
  //  missile it was, and, as a nuclear attack is, to everyone else.
  [
    'unit:nuclear-stopped',
    (ctx: NotificationContext, unit: Unit) => {
      stoppedNuclearAttacks.add(unit);

      return ctx.view.owns(unit.player())
        ? new Notification('Unit.nuclear-stopped.ours', { unit })
        : new Notification('Unit.nuclear-stopped', {
            player: unit.player(),
          });
    },
  ],

  [
    'unit:lost-at-sea',
    (ctx: NotificationContext, unit: Unit) =>
      !ctx.view.owns(unit.player())
        ? null
        : new Notification(
            workerRules().needsFuel(unit)
              ? 'Unit.out-of-fuel'
              : 'Unit.lost-at-sea',
            {
              unit,
            }
          ),
  ],

  // Civ2's fuel (M2b): an aircraft that ran out says so itself, rather than as a loss at sea.
  [
    'unit:out-of-fuel',
    (ctx: NotificationContext, unit: Unit) =>
      !ctx.view.owns(unit.player())
        ? null
        : new Notification('Unit.out-of-fuel', {
            unit,
          }),
  ],

  // An airlifted unit shot down by an enemy fighter near either city (M2b), told to the player who lost it.
  [
    'unit:airlift-shot-down',
    (ctx: NotificationContext, unit: Unit, by: Player | null) =>
      !ctx.view.owns(unit.player())
        ? null
        : // The player whose fighter it was, named only once met (#59).
        by !== null && ctx.hasMet(by)
        ? new Notification('Unit.airlift-shot-down', { unit, player: by })
        : new Notification('Unit.airlift-shot-down.unmet', { unit }),
  ],

  // A unit promoted to veteran after a win (M2b), as news that needn't stop play.
  [
    'unit:promoted',
    (ctx: NotificationContext, unit: Unit) =>
      !ctx.view.owns(unit.player())
        ? null
        : new Notification('Unit.promoted', { unit }, true),
  ],

  // Who won each battle, with what, for a city that shrinks for losing its defender in it, which can be told so by the
  //  unit that won (`city:shrink`, below).
  [
    'unit:defeated',
    (ctx: NotificationContext, loser: Unit, winner: Unit, action?: Action) => {
      if (action instanceof Action) {
        lastWin.set(winner, action);
      }

      return null;
    },
  ],

  // A city of ours that lost a citizen as its defender lost (M2b), once for each attack, as news that needn't stop play:
  //  the battle has been heard, and the city's size is on the map.
  [
    'city:shrink',
    (ctx: NotificationContext, city: City, cause: unknown) => {
      if (!ctx.view.owns(city.player())) {
        return null;
      }

      const attack = lostDefence(city, cause);

      if (attack === null || toldShrinks.has(attack)) {
        return null;
      }

      toldShrinks.add(attack);

      return new Notification('City.shrink-defender-lost', { city }, true);
    },
  ],

  [
    'unit:unsupported',
    (ctx: NotificationContext, city: City, unit: Unit) =>
      !ctx.view.owns(city.player())
        ? null
        : new Notification('City.unit-unsupported', {
            city,
            unit,
          }),
  ],

  [
    'unit:trade-route-established',
    (
      ctx: NotificationContext,
      player: Player,
      home: City,
      city: City,
      goods: string,
      bonus: number
    ) =>
      !ctx.view.owns(player)
        ? null
        : new Notification('Unit.trade-route-established', {
            bonus,
            city,
            goods,
            home,
          }),
  ],

  // Told to the player whose unit is on the hut's square.
  [
    'goody-hut:action-performed',
    (ctx: NotificationContext, goodyHut: GoodyHut, action: object) =>
      ctx
        .unitsOn(goodyHut.tile())
        .some((unit: Unit) => ctx.view.owns(unit.player()))
        ? new Notification(
            `GoodyHut.action-performed.${action.constructor.name}`,
            {
              goodyHut,
              action,
              ...amountOf(action),
            }
          )
        : null,
  ],
];

export default unitNotifications;
