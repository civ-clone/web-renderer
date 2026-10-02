// The size a city has to be under for Settlers to join it: `joinCitySizeLimit`
// in `@civ-clone/civ1-unit/Rules/Unit/canJoinCity`. Repeated here because the
// UI doesn't bundle the engine.
export const joinCitySizeLimit = 10;

export type JoiningUnit = {
  _: string;
  actions: { _: string }[];
  player: { id: string };
};

export type JoinableCity = {
  growth: { size: number };
  name: string;
  player: { id: string };
};

/**
 * The city a Settlers is standing in but can't join because of its size, or
 * `null`.
 *
 * The engine offers no `JoinCity` there, so the join key would do nothing and
 * say nothing. Civ1 says why (#243). Only when the size is the reason: a
 * Settlers with no moves left isn't offered the action either, in a city of
 * any size.
 */
export const cityTooLargeToJoin = <City extends JoinableCity>(
  unit: JoiningUnit,
  city: City | null
): City | null =>
  unit._ === 'Settlers' &&
  city !== null &&
  city.player.id === unit.player.id &&
  city.growth.size >= joinCitySizeLimit &&
  !unit.actions.some((action) => action._ === 'JoinCity')
    ? city
    : null;

export default cityTooLargeToJoin;
