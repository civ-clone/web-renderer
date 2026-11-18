// The debug page's options (docs/3d-renderer-plan.md 1.1b), from its address, each kept to what it can be.

import { TopologyName } from '@civ-clone/ui-client/lib/topologyFor';

const grids: TopologyName[] = ['square', 'staggered-iso', 'hex-odd-r'];

/** The page's options, from its address (`location.search`): a grid it doesn't know is the square grid. */
export const pageOptions = (search: string) => {
  const query = new URLSearchParams(search),
    // A number, or `null` for one that's missing, blank (a field left empty) or not a number.
    given = (name: string): number | null => {
      const text = query.get(name)?.trim() ?? '',
        value = Number(text);

      return text === '' || !Number.isFinite(value) ? null : value;
    },
    number = (name: string, fallback: number, min: number, max: number) => {
      const value = given(name);

      return value === null
        ? fallback
        : Math.min(max, Math.max(min, Math.round(value)));
    },
    grid = query.get('grid') as TopologyName | null,
    topologyId = grid !== null && grids.includes(grid) ? grid : 'square',
    // No more than 160 a side until distant land is drawn more coarsely (M6): a world 400 across is hundreds of MB.
    width = number('width', 80, 8, 160),
    // The staggered and hex grids wrap over the poles, so need an even number of rows.
    rows = number('height', 50, 8, 160),
    height = topologyId === 'square' || rows % 2 === 0 ? rows : rows + 1,
    seen = given('seen');

  return {
    topologyId,
    width,
    height,
    seed: number('seed', 1, 0, 2 ** 31 - 1),
    seen: seen === null ? 1 : Math.min(1, Math.max(0, seen)),
    x: number('x', Math.floor(width / 2), 0, width - 1),
    y: number('y', Math.floor(height / 2), 0, height - 1),
  };
};

export default pageOptions;
