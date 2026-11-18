import { TilesetDescriptor, expandName } from '../tilesets/TilesetDescriptor';
import { City } from '@civ-clone/ui-protocol/types';

/** The bucket of `styles` a city of `size` is in: the last whose size it has reached, the first when it has none. */
export const sizeBucket = (sizes: number[], size: number): number =>
  sizes.reduce((bucket, from, index) => (size >= from ? index : bucket), 0);

/**
 * The name of `tileset`'s sprite for `city`: its one sprite for `box` cities (Civ1's); for `styles` cities (Civ2's),
 * the one for its civilization's style, or its era's where the rules send one the tileset has a style for (M2c: Civ2's
 * industrial and modern rows), its size's bucket in that style (a bucket larger for a city the rules say is drawn
 * larger, a capital), and whether it has walls.
 */
export const citySprite = (
  { cities }: TilesetDescriptor,
  city: Pick<City, 'player' | 'growth'> & {
    style?: City['style'];
    walled?: City['walled'];
  }
): string => {
  if (cities.mode !== 'styles') {
    return cities.sprite;
  }

  // `validateDescriptor` holds a styles city to having its styles. Walled as the rules say (#688), your rivals' cities
  //  too: the rules' own test, not a look for one improvement (#1069, Civ2's Great Wall).
  const styles = cities.styles!,
    walled = city.walled === true;

  const style =
      (city.style ? styles.eras?.[city.style.era] : undefined) ??
      styles.civilizations[city.player.civilization._] ??
      styles.default,
    sizes = styles.sizesByStyle?.[style] ?? styles.sizes,
    bucket = Math.min(
      sizes.length - 1,
      sizeBucket(sizes, city.growth.size) + (city.style?.larger ? 1 : 0)
    );

  return expandName(cities.sprite, {
    style,
    size: String(bucket),
    walls: walled ? styles.walls.walled : styles.walls.plain,
  });
};

export default citySprite;
