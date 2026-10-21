import { City, Coordinate, Tile } from '../types';
import topologyFor from './topologyFor';

export type CityMapLayout = {
  /** Where the city's own square is in the small world. */
  center: Coordinate;
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
 * squares the engine says the city has, so the renderer needn't know the city's radius, with an empty square's border
 * all round: a square at its edge has unknown neighbours (for coasts, fog and terrain joins) rather than the squares
 * on the far side of the small world.
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
    };

  return {
    center,
    height: bottom - top + 3,
    tiles: city.tiles.map(toLocal),
    tilesWorked: city.tilesWorked.map(toLocal),
    width: right - left + 3,
  };
};

export default cityMapLayout;
