// What happened on the map, as it happened, for a view that shows it happening (docs/3d-renderer.md §8): which unit moved
//  where, and who fought whom. The squares themselves still come in tile patches, after the event; these say what the
//  patches can't, as a patch only says where a unit is now.

/** A square on the map, by the world's co-ordinates. */
export type MapEventSquare = { x: number; y: number };

/**
 * A unit, as the page holds it: its id is the one its data has (your own unit's, or the stand-in a rival's goes as), its
 *  type is the engine's name for it, and its player the id its player has on the page. `tile` is where it stood before
 *  the event: for a step, the square it left; in a battle, the square it fought from.
 */
export type MapEventUnit = {
  id: string;
  type: string;
  player: string;
  tile: MapEventSquare;
};

/**
 * A unit moved from one square to the next: one step of a GoTo is one of these. A ship's cargo steps with it, each
 *  carried unit after the ship, with the same squares. The patches flush after each, so for a moment a patch shows the
 *  ship on `to` with its cargo still on `from`.
 */
export type UnitMoved = {
  kind: 'moved';
  unit: MapEventUnit;
  from: MapEventSquare;
  to: MapEventSquare;
};

/** A battle, and who won it. The loser is gone from its square in the patches that follow. */
export type Battle = {
  kind: 'battle';
  attacker: MapEventUnit;
  defender: MapEventUnit;
  winner: 'attacker' | 'defender';
};

export type MapEvent = UnitMoved | Battle;
