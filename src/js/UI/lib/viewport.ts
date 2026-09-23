export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Where a thing `size` px long, sitting at `position` px in a world that wraps
 * every `span` px, lands in a viewport `extent` px long.
 *
 * The world wraps, so it can land in more than one place — or in none at all,
 * which is the common case once the layers are viewport-sized. `overhang` is
 * how far past the viewport edge the caller can still draw, so a thing that
 * starts off-screen but reaches back on to it is not culled.
 */
export const repeatOffsets = (
  position: number,
  span: number,
  extent: number,
  size: number,
  overhang: number = 0
): number[] => {
  if (span <= 0) {
    return [];
  }

  const lower = -size - overhang,
    upper = extent + overhang,
    offsets: number[] = [];

  // The first repeat that reaches the viewport is the smallest `k` with
  // `position + k * span` strictly past `lower`.
  for (
    let offset = position + (Math.floor((lower - position) / span) + 1) * span;
    offset < upper;
    offset += span
  ) {
    offsets.push(offset);
  }

  return offsets;
};

/**
 * The indices of the wrapping tiles that a `length` px run starting at `start`
 * px touches, given `count` tiles of `size` px and a drawing `overhang`.
 */
export const tileRange = (
  start: number,
  length: number,
  size: number,
  overhang: number,
  count: number
): number[] => {
  if (count <= 0 || size <= 0) {
    return [];
  }

  const first = Math.floor((start - overhang) / size),
    last = Math.ceil((start + length + overhang) / size);

  // Past a world's worth every tile is in range, and returning them once each
  // is what the caller wants — drawing a tile twice would double up anything
  // drawn with alpha.
  if (last - first >= count) {
    return Array.from({ length: count }, (_, index) => index);
  }

  const indices: number[] = [];

  for (let index = first; index < last; index++) {
    indices.push(((index % count) + count) % count);
  }

  return indices;
};

export const rectsIntersect = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

export const unionRect = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);

  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

export const rectArea = ({ width, height }: Rect): number => width * height;

/**
 * Collapse overlapping rectangles into disjoint ones.
 *
 * Compositing a region draws every layer over it in turn, so a region that
 * overlaps another would composite the shared pixels twice and double up
 * anything drawn with alpha. Unioning intersecting rectangles until none
 * intersect is coarser than an exact decomposition but it cannot overlap, and
 * the counts here are single figures.
 */
export const mergeRects = (rects: Rect[]): Rect[] => {
  const merged: Rect[] = [];

  rects.forEach((rect) => {
    let current = rect,
      absorbed = true;

    while (absorbed) {
      absorbed = false;

      for (let index = merged.length - 1; index >= 0; index--) {
        if (!rectsIntersect(merged[index], current)) {
          continue;
        }

        current = unionRect(merged[index], current);

        merged.splice(index, 1);

        absorbed = true;
      }
    }

    merged.push(current);
  });

  return merged;
};

/**
 * Where a viewport `extent` px long has to start to show a world `span` px long
 * without running past either end of it, given that it would like to start at
 * `origin`. A world shorter than the viewport sits in the middle of it.
 */
export const clampOrigin = (
  origin: number,
  extent: number,
  span: number
): number =>
  span <= extent
    ? Math.round((span - extent) / 2)
    : Math.min(Math.max(origin, 0), span - extent);

/**
 * The shortest signed step from `from` to `to` in a world that wraps every
 * `span` tiles, in `(-span / 2, span / 2]`.
 */
export const wrappedDelta = (
  from: number,
  to: number,
  span: number
): number => {
  if (span <= 0) {
    return 0;
  }

  const delta = (((to - from) % span) + span) % span;

  return delta > span / 2 ? delta - span : delta;
};

/**
 * Whether the tile `position` sits comfortably inside a viewport `visible`
 * tiles across, centred on `center`, in a world `span` tiles across — at least
 * `margin` tiles in from the last whole tile on either side.
 *
 * The centre tile always counts, however big the margin: a margin wider than
 * half the viewport would otherwise mean a tile never counts as in view, and
 * anything that recentres on that answer would do so forever.
 */
export const isWithinView = (
  position: number,
  center: number,
  visible: number,
  span: number,
  margin: number = 0
): boolean => {
  if (visible >= span) {
    return true;
  }

  const reach = Math.max(1, Math.floor(visible / 2) - Math.max(0, margin));

  return Math.abs(wrappedDelta(center, position, span)) < reach;
};
