export type DragSample = {
  x: number;
  y: number;
  time: number;
};

/**
 * How fast a drag was moving when it was let go, in px per ms, from the
 * pointer positions seen during it.
 *
 * Only the last `window` ms count: a drag that stopped and was then released
 * should not glide on the speed it had before it stopped.
 */
export const releaseVelocity = (
  samples: DragSample[],
  now: number,
  window: number = 100
): { x: number; y: number } => {
  const recent = samples.filter(({ time }) => now - time <= window);

  if (recent.length < 2) {
    return { x: 0, y: 0 };
  }

  const first = recent[0],
    last = recent[recent.length - 1],
    elapsed = last.time - first.time;

  if (elapsed <= 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: (last.x - first.x) / elapsed,
    y: (last.y - first.y) / elapsed,
  };
};
