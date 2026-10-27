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
 * `upNext` are the ids of units to take before any other, in order, such as
 * those a transport has just unloaded (#590): while one of them can act, the
 * last unit keeps the focus only if it is one of them.
 *
 * Matched by id, not by object: a full rebuild (a loaded game) makes every
 * object afresh, so the last unit need not be the same object as any candidate
 * (#189). The unit returned is always the candidate, so the caller holds the
 * current copy.
 */
export const chooseActiveUnit = <T extends CandidateUnit>(
  units: T[],
  lastUnitId: string | null,
  isVisible: (x: number, y: number) => boolean,
  upNext: string[] = []
): T | null => {
  const available = upNext.filter((id) => units.some((unit) => unit.id === id)),
    preferredId =
      available.length === 0 ||
      (lastUnitId !== null && available.includes(lastUnitId))
        ? lastUnitId
        : available[0];

  return (
    units.find((unit) => unit.id === preferredId) ??
    units.find((unit) => isVisible(unit.tile.x, unit.tile.y)) ??
    units[0] ??
    null
  );
};

export default chooseActiveUnit;
