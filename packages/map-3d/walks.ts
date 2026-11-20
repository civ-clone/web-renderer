// How units walk from square to square on the 3D map (docs/3d-renderer.md §6.4, §8.2). Pure, and by the clock: the
//  view asks where each walker is at the time it draws, and the tests say what time it is.
//
// - A walk is one or more steps: from where the unit was drawn as it set off, through the middle of each square it
//   steps onto, to where it'll stand on the last.
// - Steps join. A step from the square a walk's bound for goes on from there, as a GoTo's steps come, all at once, and
//   as a unit moved again before it's arrived does.
// - It gets up to pace from standing, and slows to a stop only at its end: a step joined mid-walk goes on at the pace
//   it's at.
// - However many steps, what's left of a walk takes no longer than its pace's `most`: a railroad trip of a hundred
//   squares hurries, rather than taking half a minute.
// - Units that step together walk as one: a unit drawn where a walk is, stepping from and to the squares its last step
//   was, as it was taken, rides along. A ship and what it carries step so, the ship first, as do units sent the same
//   way at once. One stepping on from where its walk's bound goes on along it, the others staying bound there unless
//   they step along too; one stepping from elsewhere sets off from where it's drawn, and a walk it leaves empty is
//   given up (`dropped`).
// - It faces the way from one square's middle to the next (each point's `middle`), or along the way it passes where a
//   step bends (`via`, as along a road), turning as it passes a square's middle, and, when a step's joined, from the
//   way it faced then.
// - Aircraft fly an arc: a walk whose units all fly climbs as it sets off and comes down to land at its end, a step's
//   way each, so a hop of one square goes half as high as a longer flight. A step joined as it comes down climbs again
//   from where it is. One that doesn't fly rides along with a walk only if that walk doesn't fly either: what a ship
//   carries rides with it, but nothing on the ground is carried into the air.
//
// Where it walks is on the ground (`u`, `v`), each point with a `lift`: how far above the land there the unit stands,
//  which the view sets, so a walk starts and ends where the unit's drawn standing.

/** A square, as the engine has it. */
export type WalkSquare = { readonly x: number; readonly y: number };

/**
 * A point on the ground (`u`, `v`), and how far above the land there a unit stands; and the middle of the square it's
 *  on, which a walk faces between, as a unit standing faces the way it last went from one square's middle to the next.
 *  Its own point, without one.
 */
export type WalkPoint = {
  at: readonly [number, number];
  lift: number;
  middle?: readonly [number, number];
  // The way there from the point before, where it isn't straight, as a road bends (`Land#roadPath`): the points it
  //  passes between them, each from this point's middle (or the point itself, without one), so they go where it goes
  //  when it's taken a copy of the world round.
  via?: readonly (readonly [number, number])[];
};

/** How fast a walk goes. */
export type Pace = {
  // How long a step takes at full pace, in ms.
  step: number;
  // How long it takes to get up to pace from standing, and to stop, in ms.
  ramp: number;
  // The longest what's left of a walk may take, in ms.
  most: number;
};

/** A walk under way: its units, the first leading, and where it is now. */
export type Walker = {
  id: string;
  units: readonly string[];
  // Where it is on the ground, and how far above the land there.
  at: [number, number];
  lift: number;
  // How high it's flown over where it would stand: nothing, for a walk that doesn't fly.
  aloft: number;
  // Which way it faces, turned from south (`+v`) towards east (`+u`), in radians: the way it's going, turning as it
  //  passes a square's middle.
  facing: number;
  // The square it set off from, the square its last step set off from, and the square it's bound for.
  from: WalkSquare;
  before: WalkSquare;
  to: WalkSquare;
};

/** How the player's own units walk: a step in a quarter of a second, a tenth getting going and stopping. */
export const OWN_PACE: Pace = { step: 250, ramp: 100, most: 2000 };

/** How other players' units walk, on the screen: twice as fast, and never longer than a second. */
export const RIVALS_PACE: Pace = { step: 125, ramp: 50, most: 1000 };

/** A pace twice as quick, as the player can choose (`walks` in `MapView3DDeps`). */
export const quicker = (pace: Pace): Pace => ({
  step: pace.step / 2,
  ramp: pace.ramp / 2,
  most: pace.most / 2,
});

/** How long after a walk's last step a unit making the same step rides along with it, in ms. */
export const RIDE = 50;

/** How high a walk that flies climbs over where its units would stand, at the most: about an aircraft's own height. */
export const CRUISE = 0.3;

/** How far a walk that flies goes as it climbs to `CRUISE`, and as it comes down from it, in steps. */
export const CLIMB = 1;

// How near, on the ground, a unit walking must be drawn to another walk to ride along with it; and how near its height,
//  flying.
const BESIDE = 0.05,
  ALOFT_BESIDE = 0.02;

// How it moves: from `from` steps along its path at `started`, going `speed` steps a ms, up to `pace` at `rise` steps a
//  ms², then on at `top`, then stopping at `fall`, to `to`.
type Motion = {
  started: number;
  from: number;
  speed: number;
  // How long it gets up to `top` (or slows to it), goes on at it, and stops, in ms; and how fast it changes pace.
  rising: number;
  rise: number;
  top: number;
  going: number;
  stopping: number;
  fall: number;
  to: number;
};

type Walk = {
  id: string;
  units: string[];
  // The square it set off from; and those it goes through, with their points, from the one before where it is now.
  from: WalkSquare;
  points: WalkPoint[];
  squares: WalkSquare[];
  // When its last step was taken: a unit making the same step this soon after rides along.
  stepped: number;
  motion: Motion;
  // The way it faced as its last step was joined, when, and how long it takes to turn from it to the way its path
  //  goes, so it turns rather than snapping round.
  turned: { facing: number; at: number; over: number } | null;
  // Whether its units fly; how many steps of its path have been let go as passed; and how high it was, as a share of
  //  the climb (0 to 1), how far along its whole path, when it set off or its last step was joined: it climbs on from
  //  there.
  flies: boolean;
  flown: number;
  climb: { from: number; at: number };
};

const sameSquare = (a: WalkSquare, b: WalkSquare): boolean =>
  a.x === b.x && a.y === b.y;

/** How far along its path (in steps) a motion is at `now`, and how fast it's going there (steps a ms). */
export const motionAt = (
  motion: Motion,
  now: number
): { along: number; speed: number } => {
  const { started, from, speed, rising, rise, top, going, stopping, fall, to } =
      motion,
    t = Math.max(0, now - started);

  if (t < rising) {
    return {
      along: from + speed * t + (rise * t * t) / 2,
      speed: speed + rise * t,
    };
  }

  const risen = from + ((speed + top) / 2) * rising;

  if (t < rising + going) {
    return { along: risen + top * (t - rising), speed: top };
  }

  const went = risen + top * going,
    s = t - rising - going;

  if (s < stopping) {
    return {
      along: went + top * s - (fall * s * s) / 2,
      speed: top - fall * s,
    };
  }

  return { along: to, speed: 0 };
};

/** When a motion stops. */
export const motionEnds = (motion: Motion): number =>
  motion.started + motion.rising + motion.going + motion.stopping;

/**
 * A motion from `from` steps along a path, going `speed`, to `to`, from `now`, at `pace`: up to full pace, or as near as
 *  it gets before it has to slow, then stopping at `to`. Hurried, where what's left would take longer than its most.
 */
export const plan = (
  now: number,
  from: number,
  speed: number,
  to: number,
  pace: Pace
): Motion => {
  const left = Math.max(0, to - from),
    ramp = Math.max(1, pace.ramp),
    // At full pace from standing, `left` steps take `left` steps' time and a ramp's: hurried to fit its most.
    full = Math.max(
      1 / pace.step,
      pace.most > ramp * 2 ? left / (pace.most - ramp) : 0
    ),
    rate = full / ramp;

  if (left <= 0) {
    return {
      started: now,
      from: to,
      speed: 0,
      rising: 0,
      rise: 0,
      top: 0,
      going: 0,
      stopping: 0,
      fall: 0,
      to,
    };
  }

  // Too fast to stop in time at its rate: it slows as it must, from now.
  if ((speed * speed) / (2 * rate) >= left) {
    const stopping = (2 * left) / speed;

    return {
      started: now,
      from,
      speed,
      rising: 0,
      rise: 0,
      top: speed,
      going: 0,
      stopping,
      fall: speed / stopping,
      to,
    };
  }

  // The fastest it gets: full pace, or, short of the room for it, where rising and stopping meet.
  const top = Math.min(full, Math.sqrt(rate * left + (speed * speed) / 2)),
    rising = Math.abs(top - speed) / rate,
    rise = top >= speed ? rate : -rate,
    stopping = top / rate,
    risen = ((speed + top) / 2) * rising,
    stopped = (top * stopping) / 2,
    going = Math.max(0, (left - risen - stopped) / top);

  return {
    started: now,
    from,
    speed,
    rising,
    rise,
    top,
    going,
    stopping,
    fall: rate,
    to,
  };
};

// `value` taken to the copy, a whole `period` round, nearest `near`; as it is where it doesn't wrap.
const nearest = (value: number, near: number, period: number | null): number =>
  period === null
    ? value
    : value + period * Math.round((near - value) / period);

// The way from `a` to `b`, turned from south (`+v`) towards east (`+u`); `null` where they're the same.
const wayOf = (
  a: readonly [number, number],
  b: readonly [number, number]
): number | null =>
  a[0] === b[0] && a[1] === b[1] ? null : Math.atan2(b[0] - a[0], b[1] - a[1]);

// How high a share of its climb (0 to 1) is drawn: easing off the ground and into its cruise.
const eased = (t: number): number => t * t * (3 - 2 * t);

// `a` turned towards `b` by `t`, the short way round.
const turnTowards = (a: number, b: number, t: number): number => {
  const delta = b - a - Math.PI * 2 * Math.round((b - a) / (Math.PI * 2));

  return a + delta * t;
};

/** The units walking on a map whose ground repeats every `period` across, and down where it wraps. */
export class Walks {
  #period: { u: number; v: number | null };
  #walks = new Map<string, Walk>();
  // Which walk each unit walking is in.
  #walkOf = new Map<string, string>();
  // The walks given up as their last unit left them, since last asked.
  #dropped: string[] = [];
  #made = 0;

  constructor(period: { u: number; v: number | null }) {
    this.#period = period;
  }

  /** Whether `unit` is walking. */
  walking(unit: string): boolean {
    return this.#walkOf.has(unit);
  }

  /** How many walks are under way. */
  size(): number {
    return this.#walks.size;
  }

  /**
   * `unit` steps from the square `from` to `to`, at `now`, at `pace`, flying if `flies`. Walking, it goes on from
   *  there, or rides along with the walk that's just made that step; otherwise it sets off from `setOff`, where it's
   *  drawn. It arrives at `arrive`, where it'll stand on `to`. The walk it's in.
   */
  step(
    unit: string,
    from: WalkSquare,
    to: WalkSquare,
    setOff: WalkPoint,
    arrive: WalkPoint,
    now: number,
    pace: Pace,
    flies: boolean = false
  ): string {
    const ownId = this.#walkOf.get(unit),
      own = ownId === undefined ? undefined : this.#walks.get(ownId),
      drawn = own === undefined ? setOff : this.#drawn(own, now),
      // As high as it's flown, as a share of its climb.
      climbed =
        own === undefined ? 0 : this.#climbed(own, this.#along(own, now)),
      // Another walk that's just made this step, drawn where this unit was as it made it, and as high: it rides along
      //  with it, as what a ship carries does, stepping after the ship. Not into the air, though.
      riding = [...this.#walks.values()].find(
        (walk) =>
          walk !== own &&
          (flies || !walk.flies) &&
          this.#justMade(walk, from, to, now) &&
          this.#beside(
            this.#drawn(walk, walk.stepped),
            own === undefined ? setOff : this.#drawn(own, walk.stepped)
          ) &&
          CRUISE *
            Math.abs(
              eased(this.#climbed(walk, this.#along(walk, now))) -
                eased(climbed)
            ) <
            ALOFT_BESIDE
      );

    if (riding !== undefined) {
      if (own !== undefined) {
        this.#leave(own, unit);
      }

      riding.units.push(unit);
      this.#walkOf.set(unit, riding.id);

      return riding.id;
    }

    // Going on from where its walk's bound: it goes on, at the pace it's going, along the way it's come. Those walking
    //  with it stay bound where they were, unless they step along too, as they do just after it.
    if (
      own !== undefined &&
      sameSquare(own.squares[own.squares.length - 1]!, from)
    ) {
      if (own.units.length > 1) {
        const behind: Walk = {
          ...own,
          id: `walk-${++this.#made}`,
          units: own.units.filter((id) => id !== unit),
          points: [...own.points],
          squares: [...own.squares],
        };

        this.#walks.set(behind.id, behind);
        behind.units.forEach((other) => this.#walkOf.set(other, behind.id));
        own.units = [unit];
      }

      this.#goOn(own, to, arrive, now, pace, flies);

      return own.id;
    }

    // Elsewhere, or not walking: it sets off from where it's drawn, as high as it's flown there.
    if (own !== undefined) {
      this.#leave(own, unit);
    }

    return this.#setOff(unit, from, to, drawn, arrive, now, pace, {
      flies,
      climbed,
    });
  }

  /** The walks under way at `now`, and those that have ended since, taken off. */
  at(now: number): { going: Walker[]; ended: Walker[] } {
    const going: Walker[] = [],
      ended: Walker[] = [];

    this.#walks.forEach((walk) => {
      const walker = this.#walker(walk, now);

      if (now >= motionEnds(walk.motion)) {
        ended.push(walker);
        this.#end(walk);

        return;
      }

      going.push(walker);
    });

    return { going, ended };
  }

  /** The walks given up since last asked, as their last unit left them for another: none of them goes on. */
  dropped(): string[] {
    return this.#dropped.splice(0);
  }

  /** When the walk `unit` is in ends, or nothing if it isn't walking. */
  endsAt(unit: string): number | null {
    const id = this.#walkOf.get(unit),
      walk = id === undefined ? undefined : this.#walks.get(id);

    return walk === undefined ? null : motionEnds(walk.motion);
  }

  /** When the next walk under way ends, or nothing with none. */
  nextEnd(): number | null {
    let soonest: number | null = null;

    this.#walks.forEach((walk) => {
      const ends = motionEnds(walk.motion);

      soonest = soonest === null ? ends : Math.min(soonest, ends);
    });

    return soonest;
  }

  /**
   * The walks whose units `test` picks ended now, there at once: each as it is at its end, as `endAll` has them.
   */
  endWhere(test: (units: readonly string[]) => boolean, now: number): Walker[] {
    const ended: Walker[] = [];

    this.#walks.forEach((walk) => {
      if (test(walk.units)) {
        ended.push(this.#walker(walk, Math.max(now, motionEnds(walk.motion))));
        this.#end(walk);
      }
    });

    return ended;
  }

  /**
   * Every walk ended now, there at once: each as it is at its end, so one that waits there for its patch stands where it
   *  was bound, not mid-way.
   */
  endAll(now: number): Walker[] {
    const ended = [...this.#walks.values()].map((walk) =>
      this.#walker(walk, Math.max(now, motionEnds(walk.motion)))
    );

    this.#walks.clear();
    this.#walkOf.clear();

    return ended;
  }

  // Whether `walk`'s last step, from `from` to `to`, was made just now.
  #justMade(
    walk: Walk,
    from: WalkSquare,
    to: WalkSquare,
    now: number
  ): boolean {
    const last = walk.squares.length - 1;

    return (
      last > 0 &&
      now - walk.stepped <= RIDE &&
      sameSquare(walk.squares[last - 1]!, from) &&
      sameSquare(walk.squares[last]!, to)
    );
  }

  #setOff(
    unit: string,
    from: WalkSquare,
    to: WalkSquare,
    setOff: WalkPoint,
    arrive: WalkPoint,
    now: number,
    pace: Pace,
    { flies, climbed }: { flies: boolean; climbed: number }
  ): string {
    const id = `walk-${++this.#made}`,
      walk: Walk = {
        id,
        units: [unit],
        from,
        points: [setOff],
        squares: [from],
        stepped: now,
        motion: plan(now, 0, 0, 0, pace),
        turned: null,
        flies,
        flown: 0,
        climb: { from: climbed, at: 0 },
      };

    this.#walks.set(id, walk);
    this.#walkOf.set(unit, id);
    this.#goOn(walk, to, arrive, now, pace, flies);

    return id;
  }

  // `walk` goes on to `to`, arriving at `arrive`, taken to the copy of the world nearest where it's been, from where it
  //  is now and at the pace it's going, turning from the way it faces, and climbing on from as high as it is, flying
  //  if `flies`: a unit flying on alone from what carried it takes off. The points it's passed are let go, but the one
  //  before where it is, which it turns from.
  #goOn(
    walk: Walk,
    to: WalkSquare,
    arrive: WalkPoint,
    now: number,
    pace: Pace,
    flies: boolean
  ): void {
    const { u, v } = this.#period,
      last = walk.points[walk.points.length - 1]!,
      lastMiddle = last.middle ?? last.at,
      { along, speed } = motionAt(walk.motion, now),
      passed = Math.max(0, Math.floor(along) - 1),
      facing = walk.points.length > 1 ? this.#walker(walk, now).facing : null,
      end = walk.points.length - 1,
      into = along - (end - 1),
      flown = this.#along(walk, now);

    // As high as it is: a walk just set off is as high as it set off.
    if (walk.points.length > 1) {
      walk.climb = {
        from: this.#climbed(walk, flown),
        at: walk.flown + flown,
      };
    }

    walk.flies = flies;

    // Where it was to stop is a square it passes through now: through its middle, not in front of a city there, where
    //  that moves it no more than a hundredth of a square from where it's drawn, as when a GoTo's steps come together.
    if (
      last.middle !== undefined &&
      into *
        Math.hypot(last.middle[0] - last.at[0], last.middle[1] - last.at[1]) <
        0.01
    ) {
      walk.points[end] = {
        at: last.middle,
        lift: 0,
        middle: last.middle,
        // Still along the road there, as it bends.
        ...(last.via === undefined ? {} : { via: last.via }),
      };
    }

    walk.points.splice(0, passed);
    walk.squares.splice(0, passed);
    walk.flown += passed;
    walk.points.push({
      at: [
        nearest(arrive.at[0], last.at[0], u),
        nearest(arrive.at[1], last.at[1], v),
      ],
      lift: arrive.lift,
      ...(arrive.middle === undefined
        ? {}
        : {
            middle: [
              nearest(arrive.middle[0], lastMiddle[0], u),
              nearest(arrive.middle[1], lastMiddle[1], v),
            ] as [number, number],
          }),
      ...(arrive.via === undefined ? {} : { via: arrive.via }),
    });
    walk.squares.push(to);
    walk.stepped = now;
    walk.turned =
      facing === null ? null : { facing, at: now, over: pace.step / 2 };
    walk.motion = plan(
      now,
      along - passed,
      speed,
      walk.points.length - 1,
      pace
    );
  }

  // `unit` leaves `walk`: one walking alone ends it there.
  #leave(walk: Walk, unit: string): void {
    walk.units = walk.units.filter((id) => id !== unit);
    this.#walkOf.delete(unit);

    if (walk.units.length === 0) {
      this.#walks.delete(walk.id);
      this.#dropped.push(walk.id);
    }
  }

  // Whether two points on the ground are as good as the same, a copy of the world round or not.
  #beside(a: WalkPoint, b: WalkPoint): boolean {
    const { u, v } = this.#period;

    return (
      Math.hypot(
        nearest(a.at[0], b.at[0], u) - b.at[0],
        nearest(a.at[1], b.at[1], v) - b.at[1]
      ) < BESIDE
    );
  }

  #end(walk: Walk): void {
    this.#walks.delete(walk.id);
    walk.units.forEach((unit) => this.#walkOf.delete(unit));
  }

  // Where `walk` is drawn at `now`, as a point to set off from.
  #drawn(walk: Walk, now: number): WalkPoint {
    const { at, lift } = this.#walker(walk, now);

    return { at, lift };
  }

  // How far along its path `walk` is drawn at `now`, in steps from the first point it has.
  #along(walk: Walk, now: number): number {
    return Math.min(
      walk.points.length - 1,
      Math.max(0, motionAt(walk.motion, now).along)
    );
  }

  // How high `walk` is at `along`, as a share of its climb, 0 to 1: climbing from as high as it was when it set off or a
  //  step was last joined, and coming down over its last `CLIMB` of a step, landing at its end. Nothing if it doesn't
  //  fly.
  #climbed(walk: Walk, along: number): number {
    if (!walk.flies) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(
        1,
        walk.climb.from + (walk.flown + along - walk.climb.at) / CLIMB,
        (walk.points.length - 1 - along) / CLIMB
      )
    );
  }

  // Where the step from `walk`'s point `i` to the next is `t` of the way along it, and the way it's going there: straight,
  //  facing from one square's middle to the next, or along the way it passes (`via`), by how far along it, facing the
  //  way it goes there.
  #stepAt(
    walk: Walk,
    i: number,
    t: number
  ): { at: [number, number]; way: number | null } {
    const a = walk.points[i]!,
      b = walk.points[i + 1] ?? a,
      middle = (point: WalkPoint): readonly [number, number] =>
        point.middle ?? point.at;

    if (b.via === undefined || b.via.length === 0) {
      return {
        at: [
          a.at[0] + (b.at[0] - a.at[0]) * t,
          a.at[1] + (b.at[1] - a.at[1]) * t,
        ],
        way: b === a ? null : wayOf(middle(a), middle(b)),
      };
    }

    const [mu, mv] = middle(b),
      way: (readonly [number, number])[] = [
        a.at,
        ...b.via.map(([du, dv]) => [mu + du, mv + dv] as const),
        b.at,
      ],
      lengths = way
        .slice(1)
        .map((to, index) =>
          Math.hypot(to[0] - way[index]![0], to[1] - way[index]![1])
        ),
      total = lengths.reduce((sum, length) => sum + length, 0),
      straight = wayOf(middle(a), middle(b)),
      // The way it goes at each point it passes: halfway between the pieces either side, so it turns as it goes along
      //  one, not all at once at its end.
      pieces = way
        .slice(1)
        .map((to, index) => wayOf(way[index]!, to) ?? straight ?? 0),
      turns = way.map((_, index) => {
        const before = pieces[index - 1],
          after = pieces[index];

        return before === undefined
          ? after!
          : after === undefined
          ? before
          : turnTowards(before, after, 0.5);
      });
    let left = Math.min(1, Math.max(0, t)) * total;

    for (let piece = 0; piece < lengths.length; piece++) {
      const length = lengths[piece]!,
        from = way[piece]!,
        to = way[piece + 1]!;

      if (left <= length || piece === lengths.length - 1) {
        const share = length === 0 ? 0 : Math.min(1, left / length);

        return {
          at: [
            from[0] + (to[0] - from[0]) * share,
            from[1] + (to[1] - from[1]) * share,
          ],
          way: turnTowards(turns[piece]!, turns[piece + 1]!, share),
        };
      }

      left -= length;
    }

    return { at: [b.at[0], b.at[1]], way: wayOf(middle(a), middle(b)) };
  }

  #walker(walk: Walk, now: number): Walker {
    const { points, squares, turned } = walk,
      last = points.length - 1,
      along = this.#along(walk, now),
      index = Math.min(last - 1, Math.floor(along)),
      t = along - index,
      a = points[index]!,
      b = points[index + 1] ?? a,
      { at, way: going } = this.#stepAt(walk, index, t),
      // The way step `i` goes as it leaves a square's middle (0), and as it comes to the next (1).
      way = (i: number, end: 0 | 1): number | null =>
        i < 0 || i >= last ? null : this.#stepAt(walk, i, end).way,
      // How far it turns at the middle between step `i` and the next, the short way round, from the way it comes in to
      //  the way it goes out: one turn for both sides of the middle, so they can't turn opposite ways round, as they
      //  could when it doubles back.
      turnAt = (i: number): number | null => {
        const into = way(i, 1),
          out = way(i + 1, 0);

        return into === null || out === null
          ? null
          : turnTowards(0, out - into, 1);
      },
      here = going ?? 0,
      // Turning at each square's middle: a quarter of a step either side, half of it before the middle and half after,
      //  on from the way it's going now, so it turns with no jolt, however its steps bend.
      coming = turnAt(index),
      leaving = turnAt(index - 1),
      pathFacing =
        t > 0.75 && coming !== null
          ? here + coming * (t - 0.75) * 2
          : t < 0.25 && leaving !== null
          ? here - leaving * (0.5 - t * 2)
          : here,
      // Just after a step's joined, from the way it faced then.
      facing =
        turned !== null && now - turned.at < turned.over
          ? turnTowards(
              turned.facing,
              pathFacing,
              Math.max(0, now - turned.at) / turned.over
            )
          : pathFacing;

    return {
      id: walk.id,
      units: [...walk.units],
      at,
      lift: a.lift + (b.lift - a.lift) * t,
      aloft: CRUISE * eased(this.#climbed(walk, along)),
      facing,
      from: walk.from,
      before: squares[last - 1] ?? squares[last]!,
      to: squares[last]!,
    };
  }
}

export default Walks;
