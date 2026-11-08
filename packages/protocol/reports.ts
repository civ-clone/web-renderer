// The reports' rows as the worker sends them (#825): the worker works them out, the page only draws them.
import { UnitStats } from './civilopedia';

// One row as the UI gets it. Nothing in it identifies an unmet civilization: no id, and no name or colours, only its
//  place and its power.
export type CivilizationPowerRow = {
  rank: number;
  power: number;
  // A row of the view's own: the player's, a watched group's members (#607), nobody's when watching the whole map.
  own: boolean;
  // Only for the player's own civilization and those it has met.
  civilization: string | null;
  colors: [string, string] | null;
};

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

export type IntelligenceAffair = {
  // Only for a civilization the player has met (#59).
  civilization: string | null;
  atPeace: boolean;
};

export type IntelligenceDetails = {
  // The leader's personality: the traits that aren't the normal one, as v474.05 lists them.
  traits: string[];
  capital: {
    name: string;
    // The founder's civilization, whose list the name comes from (`Generic.city-name`).
    civilization: string;
  } | null;
  government: string | null;
  gold: number;
  cities: number;
  units: number;
  foreignAffairs: IntelligenceAffair[];
  advances: string[];
};

export type IntelligenceRow = {
  civilization: string;
  colors: [string, string] | null;
  // Known to anyone who has met them, as v474.05 shows it without an embassy (#419).
  leader: string | null;
  // The player's own dealings with them, embassy or not: at peace, or at war, as `atPeace` below counts it.
  atPeace: boolean;
  // Whether they hold an embassy with the player.
  theirEmbassy: boolean;
  // The year of the first dealings between the two, or `null` for none: met only by seeing a city. Units meeting
  //  register a `Contact` as they meet, before any talks, so a first meeting has its year.
  firstMet: number | null;
  // Only for a civilization the player holds an embassy with.
  details: IntelligenceDetails | null;
};

export type MilitaryStatusRow = {
  // The class name, as the unit's strings are keyed (`unit:<name>.name`).
  unit: string;
  // Its Civilopedia entry's key, for the report to open (#744).
  key: string;
  stats: UnitStats;
  active: number;
  inProduction: number;
};

export type MilitaryLossRow = {
  unit: string;
  key: string;
  lost: number;
};

export type MilitaryReport = {
  // Each type we have or are building.
  status: MilitaryStatusRow[];
  // Each type we have lost.
  losses: MilitaryLossRow[];
};

export type TopCitiesCitizens = {
  happy: number;
  content: number;
  unhappy: number;
  // Specialist class names, e.g. `Entertainer`.
  specialists: string[];
};

// One row as the UI gets it. Nothing in it identifies a city or a player beyond what is shown: no ids, no tiles and no
//  score, so a row for a city the player hasn't seen can't be matched to anything else.
export type TopCitiesRow = {
  rank: number;
  size: number;
  citizens: TopCitiesCitizens;
  wonders: string[];
  // Only for a city whose tile the player has seen.
  city: {
    name: string;
    civilization: string;
  } | null;
  // Only for a civilization the player has met.
  owner: {
    civilization: string;
    colors: [string, string] | null;
  } | null;
};

// How the game ended, for the player's ending window (#176): worked out in the worker, so the UI only draws it.

// A civilization as the window names it: its civilization and leader, by type name, for the UI to translate.
export type GameOverCivilization = {
  civilization: string;
  leader: string | null;
};

export type GameOverDetails = {
  // The result's, so the Hall of Fame records each game once however often the window opens (#179).
  id: string;
  reason: string;
  you: GameOverCivilization;
  // `null` when no one won: the date, retiring, your civilization destroyed. `known` is false for a civilization
  //  you never met, which the window doesn't name.
  winner: (GameOverCivilization & { you: boolean; known: boolean }) | null;
  turn: number;
  year: number;
  difficulty: string | null;
  // None when your civilization was destroyed: there is no score, rating or Hall of Fame then.
  score: CivilizationScore | null;
  rating: number | null;
  // Which famous leader the rating exceeds (`FAMOUS_LEADERS`), or `null` for a rating of 0.
  famousLeader: string | null;
  // Your latest discovery, which the archeologists name when your civilization is destroyed.
  discovery: string | null;
  scoringComplete: boolean;
  // Every ending but your own destruction can be played on from.
  keepPlaying: boolean;
};
