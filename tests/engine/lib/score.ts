// Civ1's Civilization Score, as v474.05 adds it up (OpenCivOne, `Overlay_20.cs`
//  `F20_0000_0ca9_ShowCivilizationScorePopup`; docs/arena.md). The arithmetic only: the counts it's given are the
//  engine's.

export const SCORE_PER_WONDER = 20;
export const SCORE_PER_POLLUTED_TILE = -10;

// A city's citizens: 2 for a happy one, 1 for a content one or a specialist, nothing for an unhappy one.
export const scoreCitizens = (
  size: number,
  happy: number,
  unhappy: number
): number => size + happy - unhappy;

export const scoreWonders = (wonders: number): number =>
  SCORE_PER_WONDER * wonders;

export const scorePollution = (pollutedTiles: number): number =>
  SCORE_PER_POLLUTED_TILE * pollutedTiles;

// Never below 0.
export const score = (
  citizens: number,
  wonders: number,
  pollution: number
): number => Math.max(0, citizens + wonders + pollution);
