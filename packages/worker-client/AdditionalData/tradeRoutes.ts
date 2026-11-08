import {
  TradeRouteRegistry,
  instance as tradeRouteRegistryInstance,
} from '@civ-clone/core-city/TradeRouteRegistry';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import City from '@civ-clone/core-city/City';
import TradeRoute from '@civ-clone/core-city/TradeRoute';
import Yield from '@civ-clone/core-yield/Yield';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

export type TradeRouteSummary = {
  civilization: string;
  name: string;
  trade: number;
};

/**
 * The trade routes a city holds, each with its partner's name and the trade it adds, for the city screen (#57). The
 * routes themselves aren't sent, and a partner can be a city the player knows only by name. The trade is what the
 * ruleset's route rule added to the city's yields, whose provider is the partner's id.
 */
export const tradeRoutes = (
  tradeRouteRegistry: TradeRouteRegistry = tradeRouteRegistryInstance
): AdditionalData =>
  new AdditionalData(City, 'tradeRoutes', (city: City): TradeRouteSummary[] => {
    const routes = tradeRouteRegistry.getByCity(city);

    if (routes.length === 0) {
      return [];
    }

    const values = city
      .yields()
      .flatMap((cityYield: Yield) => cityYield.values());

    return routes.map((route: TradeRoute): TradeRouteSummary => {
      const partner = route.to();

      return {
        civilization: typeNameOf(
          partner.originalPlayer().civilization().sourceClass()
        ),
        name: partner.name(),
        trade: values
          .filter(([, provider]) => provider === partner.id())
          .reduce((total, [value]) => total + value, 0),
      };
    });
  });

export default tradeRoutes;
