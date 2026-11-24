// How battles play out on the 3D map (docs/3d-renderer.md §6.4, §8.2). Pure, and by the clock, as walks are
//  (`walks.ts`): the view asks where each fighter is at the time it draws, and the tests say what time it is.
//
// - The attacker sets off from where it stands towards the square it attacks, gathering pace, to the edge between the
//   two: that's the blow.
// - Won, it goes back to where it stood, and the loser fades away where it stood.
// - Lost, it fades away at the edge.
// - A battle waits for those whose attacker is one of its units, as one figure can't lunge twice at once: a unit
//   attacking again, or attacked as it lunges. Others are fought at once, several at a square together, as a rival's
//   attacks on a city come, though never before one that came before it there: blows at a square fall in the order the
//   battles came. One can wait for its attacker to get there, walking. Those ended at once, those waiting for them go on
//   as soon as they can.
// - An attacker's drawn once, in the first battle it's in: one attacking again stands in the next battle only once the
//   last's over.
// - Where its fighters are drawn with their models' rigged copies (plan 2.2), it's paced for their clips (`clipPace`):
//   the attacker plays `fight` from the start, the blow falling as its first shot lands, standing where it is to shoot;
//   the loser plays `die` from the blow, solid till it's fallen, then fades.
//
// Where a fighter is is on the ground (`u`, `v`), with a `lift`, as a walker's is.

import type { RigFacts } from './markers/clips';
import { ClipRole } from './models/modelSet';
import { SHOT_LOOKS, kindOf, shotOver } from './shots';
import { WalkPoint, WalkSquare } from './walks';

/** How fast a battle goes, in ms. */
export type BattlePace = {
  // From standing to the blow.
  reach: number;
  // From the blow back to where it stood, won.
  back: number;
  // From the blow to gone, for the loser.
  fade: number;
  // How far towards the edge the attacker goes, from 0, standing where it is, to 1, the whole way: 1 where it's not
  //  said.
  lunge?: number;
  // From the blow to when the loser starts to fade, solid as it falls: none where it's not said.
  falls?: number;
  // The clips its fighters play (plan 2.2): none where it's not said.
  clips?: BattleClips;
};

/** The clips a battle's fighters play, and how quick. */
export type BattleClips = {
  // How many seconds of a clip are played in a second: 2 for a battle twice as quick.
  rate: number;
  // Whether the attacker plays `fight`, from the start.
  fight: boolean;
  // Whether the loser plays `die`, from the blow.
  die: boolean;
};

/** How battles go: the blow a fifth of a second in, over a little under a second after it. */
export const BATTLE_PACE: BattlePace = { reach: 200, back: 300, fade: 600 };

/** How long a thrown bottle takes from leaving the attacker's figure to landing, in ms (each kind's: `SHOT_LOOKS`). */
export const SHOT_FLIGHT = SHOT_LOOKS.bottle.flight;

/** A pace twice as quick, as the player can choose (`walks` in `MapView3DDeps`): its clips played twice as quick. */
export const quickerBattle = (pace: BattlePace): BattlePace => ({
  ...pace,
  reach: pace.reach / 2,
  back: pace.back / 2,
  fade: pace.fade / 2,
  ...(pace.falls === undefined ? {} : { falls: pace.falls / 2 }),
  ...(pace.clips === undefined
    ? {}
    : { clips: { ...pace.clips, rate: pace.clips.rate * 2 } }),
});

/**
 * `pace`, for a battle whose attacker's drawn with a rigged copy as `attacker` says (`RigFacts`), and its loser as
 *  `loser` says, or as it is where neither has a clip to play:
 * - the attacker plays `fight` from the start; where it shoots, it stands, the blow falling as its first figure's first
 *   shot to land lands, as long after it leaves as its kind flies (`SHOT_LOOKS`), and where it doesn't, the blow falls
 *   as it would; it's drawn till its last figure's clip is over, and the last of its shots' own is (`shotOver`): the
 *   puff where each landed, the smoke where each left over before it;
 * - the loser plays `die` from the blow, solid till its last figure's fallen, then fades.
 */
export const clipPace = (
  pace: BattlePace,
  attacker: RigFacts | null,
  loser: RigFacts | null
): BattlePace => {
  const fight = attacker?.clips.fight,
    die = loser?.clips.die;

  if (fight === undefined && die === undefined) {
    return pace;
  }

  // A squad's figures play a clip that's played once each a little after the one before (`FIGURE_STAGGER`).
  const tail = (facts: RigFacts | null | undefined): number =>
      Math.max(0, (facts?.figures ?? 1) - 1) * (facts?.stagger ?? 0),
    shots = fight?.shots ?? [],
    // The first shot to land, of the first figure, as long after it leaves as its kind flies; and the last of the
    //  last figure's own over, its puff where it lands.
    first =
      shots.length === 0
        ? undefined
        : Math.min(
            ...shots.map(
              (shot) => shot.at * 1000 + SHOT_LOOKS[kindOf(shot)].flight
            )
          ),
    last =
      shots.length === 0
        ? 0
        : Math.max(
            ...shots.map(
              (shot) =>
                (shot.at + tail(attacker)) * 1000 + shotOver(kindOf(shot))
            )
          ),
    reach = first === undefined ? pace.reach : first;

  return {
    ...pace,
    reach,
    back:
      fight === undefined
        ? pace.back
        : Math.max(
            pace.back,
            (fight.duration + tail(attacker)) * 1000 - reach,
            last - reach
          ),
    ...(first === undefined ? {} : { lunge: 0 }),
    ...(die === undefined
      ? {}
      : { falls: (die.duration + tail(loser)) * 1000 }),
    clips: { rate: 1, fight: fight !== undefined, die: die !== undefined },
  };
};

// How long a battle at `pace` goes on after its blow: the attacker back where it stood, won, and the loser gone; and,
//  where the attacker plays `fight`, its shots landed and burst, won or lost (`clipPace`).
const afterBlow = (pace: BattlePace, won: boolean): number =>
  won || pace.clips?.fight === true
    ? Math.max(pace.back, (pace.falls ?? 0) + pace.fade)
    : (pace.falls ?? 0) + pace.fade;

/** How long a battle at `pace` takes, from the start to over, won or lost. */
export const battleLength = (pace: BattlePace, won = true): number =>
  pace.reach + afterBlow(pace, won);

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
  // The clip its figures play, and how far in, in seconds, where its battle's paced for clips (`clipPace`).
  clip?: { role: ClipRole; seconds: number };
  // The attacker, paced for its `fight` clip: how far into that it is, in seconds, by the battle's clock, though it's
  //  falling, lost, so its figures' shots still leave as that clip has them, each as it comes to it.
  fought?: number;
};

/** When the blow falls in `battle`. */
export const blowAt = (battle: Battle): number =>
  battle.start + battle.pace.reach;

/** When `battle` is over: the attacker back where it stood, and the loser gone. */
export const battleEnds = (battle: Battle): number =>
  blowAt(battle) + afterBlow(battle.pace, battle.won);

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

// Gathering pace, and easing in and out.
const easeIn = (t: number): number => t * t;
const easeInOut = (t: number): number => t * t * (3 - 2 * t);

/**
 * How far to the edge the attacker is at `now`, from 0 (where it stands) to 1 (the blow), as far as it lunges
 *  (`lunge`), and how solid it and the loser are drawn: the loser solid as it falls (`falls`), then fading.
 */
export const battleAt = (
  battle: Battle,
  now: number
): { reach: number; attacker: number; fallen: number } => {
  const { reach, back, fade, lunge = 1, falls = 0 } = battle.pace,
    since = now - blowAt(battle),
    fading =
      since < falls ? 1 : 1 - clamp(fade <= 0 ? 1 : (since - falls) / fade);

  if (since < 0) {
    return {
      reach:
        easeIn(clamp(reach <= 0 ? 1 : (now - battle.start) / reach)) * lunge,
      attacker: 1,
      fallen: 1,
    };
  }

  if (!battle.won) {
    return { reach: lunge, attacker: fading, fallen: 0 };
  }

  return {
    reach: (1 - easeInOut(clamp(back <= 0 ? 1 : since / back))) * lunge,
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
      start: this.#startOf(of, pace, this.#battles, Math.max(now, notBefore)),
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
   *  it, and each in `ended`. Those before them at the squares they attack go with them, their blows first, so blows
   *  there still fall in the order the battles came. Those yet to start that were waiting for them start as soon as
   *  they can.
   */
  endWhere(
    test: (battle: Battle) => boolean,
    now: number
  ): {
    struck: Battle[];
    ended: Battle[];
  } {
    const picked = this.#battles.filter(test),
      ended = this.#battles.filter(
        (battle, index) =>
          picked.includes(battle) ||
          (!this.#struck.has(battle.id) &&
            picked.some(
              (later) =>
                this.#battles.indexOf(later) > index &&
                sameSquare(later.defenderSquare, battle.defenderSquare)
            ))
      ),
      struck = ended.filter((battle) => !this.#struck.has(battle.id));

    struck.forEach((battle) => this.#struck.add(battle.id));
    this.#take(ended);

    if (ended.length > 0) {
      this.#battles.forEach((battle, index) => {
        if (battle.start > now) {
          battle.start = this.#startOf(
            battle,
            battle.pace,
            this.#battles.slice(0, index),
            Math.max(now, battle.notBefore)
          );
        }
      });
    }

    return { struck, ended };
  }

  /** How long the longest battle any of `units` attacks in takes, start to over, or nothing with none. */
  longest(units: readonly string[]): number {
    return this.#battles
      .filter(({ attacker }) => units.includes(attacker))
      .reduce(
        (longest, { pace, won }) => Math.max(longest, battleLength(pace, won)),
        0
      );
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

  // When a battle at `pace` starts, no sooner than `soonest`, after each of `before` it waits for; and with its blow no
  //  sooner than those before it at the square it attacks (one whose blow's fallen, before now), so blows there fall in
  //  the order the battles came, as what each is fought on is what the last left, whatever their paces.
  #startOf(
    of: BattleOf,
    pace: BattlePace,
    before: Battle[],
    soonest: number
  ): number {
    return before.reduce(
      (latest, battle) =>
        waitsFor(battle, of)
          ? Math.max(latest, battleEnds(battle))
          : sameSquare(battle.defenderSquare, of.defenderSquare)
          ? Math.max(latest, blowAt(battle) - pace.reach)
          : latest,
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
  //  the loser where it fell, from the blow till it's gone. Paced for clips, each with the clip it plays: the attacker
  //  `fight` from the start, or, lost, `die` from the blow, and the loser `die` from the blow.
  #fighters(battle: Battle, now: number, drawn: Set<string>): Fighter[] {
    const { reach, attacker, fallen } = battleAt(battle, now),
      { from, edge, fallsAt } = battle,
      { clips } = battle.pace,
      blow = blowAt(battle),
      playing = (role: ClipRole, since: number) => ({
        clip: { role, seconds: ((now - since) / 1000) * (clips?.rate ?? 1) },
      }),
      attackerPlays =
        clips === undefined
          ? {}
          : !battle.won && now >= blow && clips.die
          ? playing('die', blow)
          : clips.fight
          ? playing('fight', battle.start)
          : {},
      fighters: Fighter[] = [],
      first = !drawn.has(battle.attacker);

    drawn.add(battle.attacker);

    // Gone, lost, while its last shots are still to land: drawn as nothing till they have.
    if (first && (attacker > 0 || clips?.fight === true)) {
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
        ...attackerPlays,
        ...(clips?.fight
          ? { fought: ((now - battle.start) / 1000) * clips.rate }
          : {}),
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
        ...(clips?.die ? playing('die', blow) : {}),
      });
    }

    return fighters;
  }
}

export default Battles;
