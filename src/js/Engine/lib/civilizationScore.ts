// The Civilization Score (#149), worked out in the worker by the engine's `Score` rules, so the UI only draws it.

// One line of the score: a stable term name, such as `citizens`, and its points.
export type CivilizationScoreTerm = {
  term: string;
  value: number;
};

export type CivilizationScore = {
  terms: CivilizationScoreTerm[];
  total: number;
};
