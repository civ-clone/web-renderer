import { TilesetDescriptor, expandName } from '../tilesets/TilesetDescriptor';
import { City } from '@civ-clone/ui-protocol/types';

/**
 * The improvement, as the engine names it, that a `styles` city is drawn walled for. Only where the page is told the
 * city's improvements: your own cities', not your rivals' (#688), which are drawn without.
 */
export const wallsImprovement = 'CityWalls';

/** The bucket of `styles` a city of `size` is in: the last whose size it has reached, the first when it has none. */
export const sizeBucket = (sizes: number[], size: number): number =>
  sizes.reduce((bucket, from, index) => (size >= from ? index : bucket), 0);

/**
 * The name of `tileset`'s sprite for `city`: its one sprite for `box` cities (Civ1's); for `styles` cities (Civ2's),
 * the one for its civilization's style, its size's bucket, and whether it has walls.
 */
export const citySprite = (
  { cities }: TilesetDescriptor,
  city: Pick<City, 'player' | 'growth'> & {
    improvements?: City['improvements'];
  }
): string => {
  if (cities.mode !== 'styles') {
    return cities.sprite;
  }

  // `validateDescriptor` holds a styles city to having its styles.
  const styles = cities.styles!,
    walled =
      city.improvements?.some(
        (improvement) => improvement._ === wallsImprovement
      ) ?? false;

  return expandName(cities.sprite, {
    style: styles.civilizations[city.player.civilization._] ?? styles.default,
    size: String(sizeBucket(styles.sizes, city.growth.size)),
    walls: walled ? styles.walls.walled : styles.walls.plain,
  });
};

export default citySprite;
