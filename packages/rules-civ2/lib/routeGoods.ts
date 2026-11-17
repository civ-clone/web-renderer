// The goods each of a city's trade routes carries, for the city screen (M2d part 2, #1007). civ2-city keeps a route as
//  core-city's `TradeRoute`, a holder and a partner and nothing more, and its goods are only names (decision 21), so
//  what a Caravan or Freight carried is told only as it arrives (`unit:trade-route-established`, with the goods). They
//  are kept here, from that event, as never-discharged pending effects on the holder (saved like any other, as
//  civ2-unit's mission records are): one per holder and partner, both ways, as civ2-city makes the route both ways.
//  A route that replaced another points at the new partner, whose record the same delivery wrote. A route made before
//  this record, or one whose record is missing, shows no goods. A second delivery to a partner keeps the first's goods.
//
// Written only by the delivery, never by a read: what the page asks about changes nothing that is saved.

import {
  PendingEffect,
  PendingEffectRegistry,
  instance as pendingEffectRegistryInstance,
} from '@civ-clone/core-pending-effect';
import {
  TradeRouteRegistry,
  instance as tradeRouteRegistryInstance,
} from '@civ-clone/core-city/TradeRouteRegistry';
import City from '@civ-clone/core-city/City';
import TradeRoute from '@civ-clone/core-city/TradeRoute';

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
 * Keeps `goods` for `holder`'s route to `partner`, after the delivery: first forgetting what `holder` kept for a partner
 *  it no longer has a route to (one a full city replaced), then keeping the goods only for a route that has none kept.
 *  A route that already existed keeps the goods that set it up: civ2-city adds no second route to the same partner,
 *  yet a delivery there still pays, and says so with its own goods. A route the city couldn't take keeps nothing.
 */
const keepForNewRoute = (
  holder: City,
  partner: City,
  goods: string,
  pendingEffectRegistry: PendingEffectRegistry,
  tradeRouteRegistry: TradeRouteRegistry
): void => {
  const partners = tradeRouteRegistry
    .getByCity(holder)
    .map((route: TradeRoute): City => route.to());

  pendingEffectRegistry
    .getByTarget(holder)
    .filter(
      (effect: PendingEffect): boolean =>
        effect.handler() === ROUTE_GOODS &&
        !partners.some(
          (city: City): boolean => city.id() === effect.data().partner
        )
    )
    .forEach((effect: PendingEffect): void =>
      pendingEffectRegistry.unregister(effect)
    );

  if (
    partners.includes(partner) &&
    recordOf(holder, partner, pendingEffectRegistry) === null
  ) {
    keepRouteGoods(holder, partner, goods, pendingEffectRegistry);
  }
};

/**
 * A delivery's goods, kept both ways (`unit:trade-route-established`: the player, the home city, the city, the goods),
 *  as civ2-city gives each city a route to the other (`keepForNewRoute`). Nothing for a route from a city to itself,
 *  which civ2-city doesn't make.
 */
export const routeGoodsListener =
  (
    pendingEffectRegistry: PendingEffectRegistry = pendingEffectRegistryInstance,
    tradeRouteRegistry: TradeRouteRegistry = tradeRouteRegistryInstance
  ) =>
  (player: unknown, home: City, city: City, goods: string): void => {
    if (home === city || typeof goods !== 'string') {
      return;
    }

    keepForNewRoute(
      home,
      city,
      goods,
      pendingEffectRegistry,
      tradeRouteRegistry
    );
    keepForNewRoute(
      city,
      home,
      goods,
      pendingEffectRegistry,
      tradeRouteRegistry
    );
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
