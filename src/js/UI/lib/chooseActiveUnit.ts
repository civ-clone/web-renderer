export type CandidateUnit = {
  id: string;
  tile: {
    x: number;
    y: number;
  };
};

/**
 * Which unit becomes active after an update: the one that was already active
 * while it can still move, otherwise the first on screen, otherwise the first.
 *
 * Matched by id, not by object: every update reconstitutes fresh objects, so
 * the last unit is never the same object as any candidate (#189). The unit
 * returned is always the candidate, so the caller holds the current copy.
 */
export const chooseActiveUnit = <T extends CandidateUnit>(
  units: T[],
  lastUnitId: string | null,
  isVisible: (x: number, y: number) => boolean
): T | null =>
  units.find((unit) => unit.id === lastUnitId) ??
  units.find((unit) => isVisible(unit.tile.x, unit.tile.y)) ??
  units[0] ??
  null;

export default chooseActiveUnit;
