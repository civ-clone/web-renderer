// How battles play out on the 3D map (docs/3d-renderer.md §6.4, §8.2). Pure, and by the clock, as walks are
//  (`walks.ts`): the view asks where each fighter is at the time it draws, and the tests say what time it is.
//
// - The attacker sets off from where it stands towards the square it attacks, gathering pace, to the edge between the
//   two: that's the blow.
// - Won, it goes back to where it stood, and the loser fades away where it stood.
// - Lost, it fades away at the edge.
// - A battle waits for those whose attacker is one of its units, as one figure can't lunge twice at once: a unit
//   attacking again, or attacked as it lunges. Others are fought at once, several at a square together, as a rival's
//   attacks on a city come. One can wait for its attacker to get there, walking. Those ended at once, those waiting for
//   them go on as soon as they can.
// - An attacker's drawn once, in the first battle it's in: one attacking again stands in the next battle only once the
//   last's over.
//
// Where a fighter is is on the ground (`u`, `v`), with a `lift`, as a walker's is.

import { WalkPoint, WalkSquare } from './walks';

/** How fast a battle goes, in ms. */
export type BattlePace = {
  // From standing to the blow.
  reach: number;
  // From the blow back to where it stood, won.
  back: number;
  // From the blow to gone, for the loser.
  fade: number;
};

/** How battles go: the blow a fifth of a second in, over a little under a second after it. */
export const BATTLE_PACE: BattlePace = { reach: 200, back: 300, fade: 600 };

/** A pace twice as quick, as the player can choose (`walks` in `MapView3DDeps`). */
export const quickerBattle = (pace: BattlePace): BattlePace => ({
  reach: pace.reach / 2,
  back: pace.back / 2,
  fade: pace.fade / 2,
});

/** How far towards the square it attacks the attacker goes: to the edge between them, from its middle. */
export const REACH = 0.45;

/** A battle, as the view tells it. */
export type BattleOf = {
  attacker: string;
  defender: string;
  // The squares each fought from.
  attackerSquare: WalkSquare;
  defenderSquare: WalkSquare;
  // Whether the attacker won.
  won: boolean;
  // Where the attacker stands, and the point at the edge it reaches.
  from: WalkPoint;
  edge: readonly [number, number];
  // Where the defender stands.
  fallsAt: WalkPoint;
  // The way the attacker faces, and the defender, as `Walker`'s `facing`.
  facing: number;
  defenderFacing: number;
};

/** A battle under way, or waiting for another to be over. */
export type Battle = BattleOf & {
  id: string;
  start: number;
  // Fought no sooner than this, as when its attacker's walking there.
  notBefore: number;
  pace: BattlePace;
};

/**
 * Something drawn for a battle: the attacker (`unit` is its id), or the loser where it fell (`fallen`), with how solid
 *  it's drawn, from 1 down to gone at 0.
 */
export type Fighter = {
  id: string;
  battle: string;
  // The attacker, or the defender fallen.
  unit: string;
  fallen: boolean;
  at: [number, number];
  lift: number;
  facing: number;
  opacity: number;
};

/** When the blow falls in `battle`. */
export const blowAt = (battle: Battle): number =>
  battle.start + battle.pace.reach;

/** When `battle` is over: the attacker back where it stood, and the loser gone. */
export const battleEnds = (battle: Battle): number =>
  blowAt(battle) +
  (battle.won
    ? Math.max(battle.pace.back, battle.pace.fade)
    : battle.pace.fade);

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

// Gathering pace, and easing in and out.
const easeIn = (t: number): number => t * t;
const easeInOut = (t: number): number => t * t * (3 - 2 * t);

/**
 * How far to the edge the attacker is at `now`, from 0 (where it stands) to 1 (the blow), and how solid it and the
 *  loser are drawn.
 */
export const battleAt = (
  battle: Battle,
  now: number
): { reach: number; attacker: number; fallen: number } => {
  const { reach, back, fade } = battle.pace,
    since = now - blowAt(battle),
    fading = 1 - clamp(fade <= 0 ? 1 : since / fade);

  if (since < 0) {
    return {
      reach: easeIn(clamp(reach <= 0 ? 1 : (now - battle.start) / reach)),
      attacker: 1,
      fallen: 1,
    };
  }

  if (!battle.won) {
    return { reach: 1, attacker: fading, fallen: 0 };
  }

  return {
    reach: 1 - easeInOut(clamp(back <= 0 ? 1 : since / back)),
    attacker: 1,
    fallen: fading,
  };
};

const sameSquare = (a: WalkSquare, b: WalkSquare): boolean =>
  a.x === b.x && a.y === b.y;

// Whether `of` waits for `earlier`: its attacker's one of `of`'s units, drawn lunging.
const waitsFor = (earlier: BattleOf, of: BattleOf): boolean =>
  earlier.attacker === of.attacker || earlier.attacker === of.defender;

export class Battles {
  // In the order they came.
  #battles: Battle[] = [];
  // Those whose blow has been told.
  #struck = new Set<string>();
  #made = 0;

  /** How many battles are under way, or waiting. */
  size(): number {
    return this.#battles.length;
  }

  /** Whether `unit` attacks in a battle that isn't over, waiting for its turn or fought. */
  attacking(unit: string): boolean {
    return this.#battles.some((battle) => battle.attacker === unit);
  }

  /** Whether `unit` is in a battle that isn't over, attacking or defending. */
  fighting(unit: string): boolean {
    return this.#battles.some(
      (battle) => battle.attacker === unit || battle.defender === unit
    );
  }

  /**
   * The first battle at the square `square` (attacked there) whose blow hasn't fallen, which the square's shown as it
   *  was before, or nothing.
   */
  awaitingBlow(square: WalkSquare): Battle | null {
    return (
      this.#battles.find(
        (battle) =>
          !this.#struck.has(battle.id) &&
          sameSquare(battle.defenderSquare, square)
      ) ?? null
    );
  }

  /**
   * A battle at `now`, at `pace`: fought at once, or no sooner than `notBefore`, as when its attacker's walking there,
   *  or, waiting for one whose attacker's one of its units, once that one's over.
   */
  add(
    of: BattleOf,
    now: number,
    pace: BattlePace,
    notBefore: number = now
  ): Battle {
    const battle: Battle = {
      ...of,
      id: `battle-${++this.#made}`,
      start: this.#startOf(of, this.#battles, Math.max(now, notBefore)),
      notBefore,
      pace,
    };

    this.#battles.push(battle);

    return battle;
  }

  /**
   * What's drawn of the battles at `now`; the battles whose blow has fallen since last asked, each once, in the order
   *  they came; and those that are over, taken off.
   */
  at(now: number): { going: Fighter[]; struck: Battle[]; ended: Battle[] } {
    const going: Fighter[] = [],
      struck: Battle[] = [],
      ended: Battle[] = [],
      // The attackers drawn: each once, in the first battle it's in.
      drawn = new Set<string>();

    this.#battles.forEach((battle) => {
      if (now >= blowAt(battle) && !this.#struck.has(battle.id)) {
        this.#struck.add(battle.id);
        struck.push(battle);
      }

      if (now >= battleEnds(battle)) {
        ended.push(battle);

        return;
      }

      going.push(...this.#fighters(battle, now, drawn));
    });

    this.#take(ended);

    return { going, struck, ended };
  }

  /**
   * The battles `test` picks over at `now`, at once: the blow fallen in those it hadn't, told in `struck` as `at` tells
   *  it, and each in `ended`. Those yet to start that were waiting for them start as soon as they can.
   */
  endWhere(
    test: (battle: Battle) => boolean,
    now: number
  ): {
    struck: Battle[];
    ended: Battle[];
  } {
    const ended = this.#battles.filter(test),
      struck = ended.filter((battle) => !this.#struck.has(battle.id));

    struck.forEach((battle) => this.#struck.add(battle.id));
    this.#take(ended);

    if (ended.length > 0) {
      this.#battles.forEach((battle, index) => {
        if (battle.start > now) {
          battle.start = this.#startOf(
            battle,
            this.#battles.slice(0, index),
            Math.max(now, battle.notBefore)
          );
        }
      });
    }

    return { struck, ended };
  }

  /** When the last battle any of `units` attacks in is over, or nothing with none. */
  busyUntil(units: readonly string[]): number | null {
    return this.#battles
      .filter(({ attacker }) => units.includes(attacker))
      .reduce<number | null>(
        (latest, battle) => Math.max(latest ?? 0, battleEnds(battle)),
        null
      );
  }

  /** Every battle over at `now`, at once, as `endWhere` has them. */
  endAll(now: number): { struck: Battle[]; ended: Battle[] } {
    return this.endWhere(() => true, now);
  }

  // When a battle starts, no sooner than `soonest`, after each of `before` it waits for.
  #startOf(of: BattleOf, before: Battle[], soonest: number): number {
    return before
      .filter((battle) => waitsFor(battle, of))
      .reduce(
        (latest, battle) => Math.max(latest, battleEnds(battle)),
        soonest
      );
  }

  // Battles over, taken off.
  #take(ended: Battle[]): void {
    if (ended.length === 0) {
      return;
    }

    this.#battles = this.#battles.filter((battle) => !ended.includes(battle));
    ended.forEach((battle) => this.#struck.delete(battle.id));
  }

  // What's drawn of `battle` at `now`: the attacker, unless it's gone, or drawn already (`drawn`) in a battle before; and
  //  the loser where it fell, from the blow till it's gone.
  #fighters(battle: Battle, now: number, drawn: Set<string>): Fighter[] {
    const { reach, attacker, fallen } = battleAt(battle, now),
      { from, edge, fallsAt } = battle,
      fighters: Fighter[] = [],
      first = !drawn.has(battle.attacker);

    drawn.add(battle.attacker);

    if (attacker > 0 && first) {
      fighters.push({
        id: battle.id,
        battle: battle.id,
        unit: battle.attacker,
        fallen: false,
        at: [
          from.at[0] + (edge[0] - from.at[0]) * reach,
          from.at[1] + (edge[1] - from.at[1]) * reach,
        ],
        lift: from.lift * (1 - reach),
        facing: battle.facing,
        opacity: attacker,
      });
    }

    if (battle.won && now >= blowAt(battle) && fallen > 0) {
      fighters.push({
        id: `${battle.id}-fallen`,
        battle: battle.id,
        unit: battle.defender,
        fallen: true,
        at: [fallsAt.at[0], fallsAt.at[1]],
        lift: fallsAt.lift,
        facing: battle.defenderFacing,
        opacity: fallen,
      });
    }

    return fighters;
  }
}

export default Battles;
