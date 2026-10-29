import { City, Coordinate, Tile } from '../types';
import topologyFor from './topologyFor';

export type CityMapLayout = {
  /** Where the city's own square is in the small world. */
  center: Coordinate;
  /**
   * The rest of the small world: the squares round and between the city's, as the player knows them, at their places in
   * the small world. Not to be drawn: they're there as the city's squares' neighbours (#685).
   */
  context: Tile[];
  /** How many squares across and down the small world is. */
  height: number;
  /** The city's squares, at their places in the small world. */
  tiles: Tile[];
  /** The squares the city works, at their places in the small world. */
  tilesWorked: Tile[];
  width: number;
};

/**
 * Where the city screen's map puts a city's squares (#88): each one next to the city, in a small world of their own,
 * so the map's canvases are the size of the city's squares rather than of the whole world. A square is put where it
 * is nearest the city, across a wrap where the world's topology has one. The small world is the box around the
 * squares the engine says the city has, so the renderer needn't know the city's radius, with a square's border all
 * round. The border, and the corners of the box that aren't the city's, are the squares there as the player knows them
 * (#685), so a square at the edge has its real neighbours for coasts, fog and terrain joins, rather than unknown ones
 * or the squares on the far side of the small world.
 */
export const cityMapLayout = (city: City): CityMapLayout => {
  const { height, width } = city.player.world,
    topology = topologyFor(city.player.world),
    // The shortest way from the city to a square along one axis: the other way round, when that is shorter and the
    //  axis wraps.
    nearest = (delta: number, size: number, wraps: boolean): number =>
      !wraps
        ? delta
        : delta > size / 2
        ? delta - size
        : delta < -size / 2
        ? delta + size
        : delta,
    offset = (tile: Tile): Coordinate => ({
      x: nearest(tile.x - city.tile.x, width, topology.wrapsX()),
      y: nearest(tile.y - city.tile.y, height, topology.wrapsY()),
    }),
    offsets = city.tiles.map(offset),
    left = Math.min(0, ...offsets.map(({ x }) => x)),
    right = Math.max(0, ...offsets.map(({ x }) => x)),
    top = Math.min(0, ...offsets.map(({ y }) => y)),
    bottom = Math.max(0, ...offsets.map(({ y }) => y)),
    center = { x: 1 - left, y: 1 - top },
    toLocal = (tile: Tile): Tile => {
      const { x, y } = offset(tile);

      return { ...tile, x: center.x + x, y: center.y + y };
    },
    localWidth = right - left + 3,
    localHeight = bottom - top + 3,
    tiles = city.tiles.map(toLocal),
    // Where a square of the small world is in the real one: across a wrap where the axis has one, and nowhere past an
    //  edge that doesn't.
    real = (local: number, centre: number, size: number, wraps: boolean) => {
      const position = centre + local;

      if (wraps) {
        return ((position % size) + size) % size;
      }

      return position >= 0 && position < size ? position : null;
    },
    known = new Map(
      (city.player.world.tiles ?? []).map((tile) => [
        `${tile.x},${tile.y}`,
        tile,
      ])
    ),
    taken = new Set(tiles.map(({ x, y }) => `${x},${y}`)),
    context: Tile[] = [];

  for (let y = 0; y < localHeight; y++) {
    for (let x = 0; x < localWidth; x++) {
      if (taken.has(`${x},${y}`)) {
        continue;
      }

      const realX = real(x - center.x, city.tile.x, width, topology.wrapsX()),
        realY = real(y - center.y, city.tile.y, height, topology.wrapsY()),
        tile =
          realX === null || realY === null
            ? undefined
            : known.get(`${realX},${realY}`);

      if (tile) {
        context.push({ ...tile, x, y });
      }
    }
  }

  return {
    center,
    context,
    height: localHeight,
    tiles,
    tilesWorked: city.tilesWorked.map(toLocal),
    width: localWidth,
  };
};

export default cityMapLayout;
