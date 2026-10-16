import { Tile, Unit, UnitAction } from '../types';

// The actions the unit action menu offers for a distant square: Go to, and the route orders the engine says the unit
//  may be given (Road to, Railroad to, #195). Whether there's a route is the engine's to decide when one is chosen.
export const distantActions = (unit: Unit, tile: Tile): UnitAction[] =>
  ['GoTo', ...(unit.routeOrders ?? [])].map(
    (name: string): UnitAction => ({
      _: name,
      __: [],
      id: '',
      from: unit.tile,
      to: tile,
    })
  );

export default distantActions;
