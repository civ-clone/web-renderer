// The goods each of a city's trade routes carries, for the city screen (M2d part 2, #1007). civ2-city keeps a route as
//  core-city's `TradeRoute`, a holder and a partner and nothing more, and its goods are only names (decision 21), so
//  what a Caravan or Freight carried is told only as it arrives (`unit:trade-route-established`, with the goods). They
//  are kept here, from that event, as never-discharged pending effects on the holder (saved like any other, as
//  civ2-unit's mission records are): one per holder and partner, both ways, as civ2-city makes the route both ways.
//  A route that replaced another points at the new partner, whose record the same delivery wrote. A route made before
//  this record, or one whose record is missing, shows no goods.
//
// Written only by the delivery, never by a read: what the page asks about changes nothing that is saved.

import {
  PendingEffect,
  PendingEffectRegistry,
  instance as pendingEffectRegistryInstance,
} from '@civ-clone/core-pending-effect';
import City from '@civ-clone/core-city/City';

export const ROUTE_GOODS = 'ui-rules-civ2:trade-route-goods';

const recordOf = (
  holder: City,
  partner: City,
  pendingEffectRegistry: PendingEffectRegistry
): PendingEffect | null =>
  pendingEffectRegistry
    .getByTarget(holder)
    .find(
      (effect: PendingEffect): boolean =>
        effect.handler() === ROUTE_GOODS &&
        effect.data().partner === partner.id()
    ) ?? null;

/** The goods `holder`'s route to `partner` carries, or `null` with none kept. */
export const routeGoods = (
  holder: City,
  partner: City,
  pendingEffectRegistry: PendingEffectRegistry = pendingEffectRegistryInstance
): string | null =>
  recordOf(holder, partner, pendingEffectRegistry)?.data().goods ?? null;

/** Keeps `goods` as what `holder`'s route to `partner` carries, in place of any kept before. */
export const keepRouteGoods = (
  holder: City,
  partner: City,
  goods: string,
  pendingEffectRegistry: PendingEffectRegistry = pendingEffectRegistryInstance
): void => {
  const kept = recordOf(holder, partner, pendingEffectRegistry);

  if (kept !== null) {
    pendingEffectRegistry.unregister(kept);
  }

  pendingEffectRegistry.register(
    new PendingEffect(ROUTE_GOODS, holder, {
      partner: partner.id(),
      goods,
    })
  );
};

/**
 * A delivery's goods, kept both ways (`unit:trade-route-established`: the player, the home city, the city, the goods),
 *  as civ2-city gives each city a route to the other. Nothing for a route from a city to itself, which civ2-city
 *  doesn't make.
 */
export const routeGoodsListener =
  (
    pendingEffectRegistry: PendingEffectRegistry = pendingEffectRegistryInstance
  ) =>
  (player: unknown, home: City, city: City, goods: string): void => {
    if (home === city || typeof goods !== 'string') {
      return;
    }

    keepRouteGoods(home, city, goods, pendingEffectRegistry);
    keepRouteGoods(city, home, goods, pendingEffectRegistry);
  };

/** A destroyed city's records go, those it held and those held to it, as civ2-city clears its routes. */
export const forgetRouteGoodsListener =
  (
    pendingEffectRegistry: PendingEffectRegistry = pendingEffectRegistryInstance
  ) =>
  (city: City): void =>
    pendingEffectRegistry
      .getByHandler(ROUTE_GOODS)
      .filter(
        (effect: PendingEffect): boolean =>
          effect.target() === city || effect.data().partner === city.id()
      )
      .forEach((effect: PendingEffect): void =>
        pendingEffectRegistry.unregister(effect)
      );

export default routeGoods;
