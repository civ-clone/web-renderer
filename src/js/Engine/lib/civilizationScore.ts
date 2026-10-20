// The Civilization Score (#149), worked out in the worker by the engine's `Score` rules, so the UI only draws it.

// One line of the score: a stable term name, such as `citizens`, and its points.
export type CivilizationScoreTerm = {
  term: string;
  value: number;
};

export type CivilizationScore = {
  terms: CivilizationScoreTerm[];
  // The conquest bonus, when you conquered the world (#176). It replaces the terms' sum when it's higher, as the
  //  total shows.
  bonus: number | null;
  total: number;
  // Once you keep playing after the game has ended, the score is final: Civ1 shows "SCORING COMPLETED".
  scoringComplete: boolean;
};
