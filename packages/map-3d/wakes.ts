// The wakes ships leave on the 3D map (docs/3d-renderer.md §6.4, plan 2.3): as a ship sails, a trail of points behind
//  it, each older the further back, which the stage draws as foam spreading out in a V and thinning away. Pure, and by
//  the clock, as walks are (`walks.ts`): the view says where each ship walking is as it draws, and asks for the wakes
//  as they are then.
//
// - A point's laid every `WAKE_EVERY` along the ship's way, so a wake's as fine however many frames there are, few or
//   many; and the newest follows the ship, so the wake reaches it.
// - A ship that's stopped, its walk over or no longer drawn, isn't followed any more: its wake goes on thinning, and is
//   gone with its last point.
// - The ground's where the walk has it: past the world's seam, a copy round, as walks go. A wake's points are as near
//   one another as the ship's were, so the view puts the whole of it where its newest point is.

/** How long a wake's foam lasts behind a ship, in ms. */
export const WAKE_LIFE = 1200;

/** How far a ship goes between the points of its wake, on the ground. */
export const WAKE_EVERY = 0.04;

/** A point of a wake: where on the ground, and how long ago the ship was there, in ms. */
export type WakePoint = { at: readonly [number, number]; age: number };

type Wake = {
  // Where the ship was, newest first, and when.
  points: { at: readonly [number, number]; time: number }[];
};

export class Wakes {
  #wakes = new Map<string, Wake>();

  /** How many wakes there are, being laid or thinning away. */
  size(): number {
    return this.#wakes.size;
  }

  /**
   * The ship walking as `id` is at `at` at `now`. The newest point follows the ship, so the wake reaches it; behind it,
   *  a point's laid every `WAKE_EVERY` along the way it's come since the last laid, however far it's gone since it was
   *  last told, as when frames are few: each where and when the ship passed it, as the straight way between has it.
   */
  trail(id: string, at: readonly [number, number], now: number): void {
    const wake = this.#wakes.get(id),
      [head, laid] = wake?.points ?? [];

    // Setting off, or with every point laid gone, or as good as gone, past its life, as after frames stopped a while:
    //  from here, not along a straight line from where it was then.
    if (
      wake === undefined ||
      head === undefined ||
      laid === undefined ||
      now - laid.time >= WAKE_LIFE
    ) {
      this.#wakes.set(id, {
        points: [
          { at, time: now },
          { at, time: now },
        ],
      });

      return;
    }

    head.at = at;
    head.time = now;

    const du = at[0] - laid.at[0],
      dv = at[1] - laid.at[1],
      since = Math.hypot(du, dv),
      count = Math.floor(since / WAKE_EVERY),
      [lu, lv] = laid.at,
      then = laid.time;

    // Newest first, as they're kept.
    wake.points.splice(
      1,
      0,
      ...Array.from({ length: count }, (_, index) => {
        const share = ((count - index) * WAKE_EVERY) / since;

        return {
          at: [lu + du * share, lv + dv * share] as const,
          time: then + (now - then) * share,
        };
      })
    );
  }

  /**
   * The wakes at `now`, each with its points, newest first, and how old each is; the points older than `WAKE_LIFE`
   *  let go, and a wake with none left, its ship no longer followed, taken off, its id among those `gone`.
   */
  at(now: number): {
    going: { id: string; points: WakePoint[] }[];
    gone: string[];
  } {
    const going: { id: string; points: WakePoint[] }[] = [],
      gone: string[] = [];

    this.#wakes.forEach((wake, id) => {
      wake.points = wake.points.filter(({ time }) => now - time < WAKE_LIFE);

      if (wake.points.length === 0) {
        this.#wakes.delete(id);
        gone.push(id);

        return;
      }

      going.push({
        id,
        points: wake.points.map(({ at, time }) => ({
          at,
          age: Math.max(0, now - time),
        })),
      });
    });

    return { going, gone };
  }

  /** Every wake gone now, as with less motion asked for: their ids. */
  endAll(): string[] {
    const ids = [...this.#wakes.keys()];

    this.#wakes.clear();

    return ids;
  }
}

/**
 * How far either side of the ship's path a wake's two lines of foam are at the ship (`start`), how much further they
 *  spread (`by`), and how far behind it they've spread that far (`over`): a V behind it, as a ship's wake is, open the
 *  same however fast it goes.
 */
export const WAKE_SPREAD = { start: 0.03, by: 0.17, over: 0.5 };

/** How wide a line of foam is when it's laid; it thins to nothing as it ages. */
export const WAKE_WIDTH = 0.016;

/** How far over the sea a wake's foam lies. */
export const WAKE_LIFT = 0.004;

/**
 * The foam of a wake laid at `points` (newest first), as triangles: `x`, `y` and `z` for each corner, from the newest
 *  point, `x` across the ground (`u`) and `z` down it (`v`), `WAKE_LIFT` up. Two lines, one each side of the ship's
 *  path, spreading out in a V the further behind it they are, and thinning away as they age; nothing where they've
 *  thinned to nothing, or with fewer than two points apart.
 */
export const wakeShape = (points: readonly WakePoint[]): number[] => {
  const [origin] = points,
    corners: number[] = [];

  if (origin === undefined) {
    return corners;
  }

  // Each point's way across the path: square to the way the ship went there, from the point after it (older) to the
  //  one before it (newer), or, at either end, the one it has.
  const across = points.map((point, index) => {
      const newer = points[index - 1] ?? point,
        older = points[index + 1] ?? point,
        du = newer.at[0] - older.at[0],
        dv = newer.at[1] - older.at[1],
        length = Math.hypot(du, dv);

      return length === 0 ? null : ([-dv / length, du / length] as const);
    }),
    // How far behind the ship each point is, along its path.
    behind = points.reduce<number[]>((so, point, index) => {
      const newer = points[index - 1];

      so.push(
        newer === undefined
          ? 0
          : so[index - 1]! +
              Math.hypot(point.at[0] - newer.at[0], point.at[1] - newer.at[1])
      );

      return so;
    }, []),
    // Each side's line's two edges at a point: out from the path, as far as it's spread, and as wide as it's thin.
    edges = (index: number, side: 1 | -1): [number, number][] | null => {
      const point = points[index]!,
        way = across[index],
        life = Math.min(1, point.age / WAKE_LIFE);

      if (way === null || way === undefined) {
        return null;
      }

      const spread =
          WAKE_SPREAD.start +
          WAKE_SPREAD.by * Math.min(1, behind[index]! / WAKE_SPREAD.over),
        width = WAKE_WIDTH * (1 - life),
        middle = [
          point.at[0] - origin.at[0] + way[0] * spread * side,
          point.at[1] - origin.at[1] + way[1] * spread * side,
        ];

      return [
        [middle[0]! - (way[0] * width) / 2, middle[1]! - (way[1] * width) / 2],
        [middle[0]! + (way[0] * width) / 2, middle[1]! + (way[1] * width) / 2],
      ];
    };

  for (let index = 0; index + 1 < points.length; index++) {
    ([1, -1] as const).forEach((side) => {
      const near = edges(index, side),
        far = edges(index + 1, side);

      if (near === null || far === null) {
        return;
      }

      const [a, b] = near,
        [c, d] = far;

      [a, c, b, b, c, d].forEach(([x, z]) => corners.push(x, WAKE_LIFT, z));
    });
  }

  return corners;
};

export default Wakes;
