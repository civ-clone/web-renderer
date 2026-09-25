import { EntityInstance, NeighbourDirection, Tile } from '../../types';
import TerrainAbstract from './TerrainAbstract';
import { isDrawable } from '../../lib/imageSize';
import { onPreloadedImagesChanged } from '../../lib/getPreloadedImage';
import { s } from '@dom111/element';

type Improvement = 'Mine' | 'Pollution' | 'Railroad' | 'Road';

type ImprovementLookup = {
  [key in Improvement]: boolean;
};

// Civ1 gives Forest and Tundra the same special, Game, but draws it as a doe on
// Forest and an antlered beast on Tundra (#69). Keyed on `Terrain:Feature`;
// anything not listed uses the sprite named after the feature.
const specialSprites: { [key: string]: string } = {
  'Forest:Game': 'doe',
};

// The composed coast tile is a pure function of the 8-neighbour bitmask and is
// always built at the sprite's 16x16, so this tops out at 256 small canvases
// instead of allocating one per coast tile per render.
const coastTileCache = new Map<number, HTMLCanvasElement>();

onPreloadedImagesChanged(() => coastTileCache.clear());

// We divide the tile into four 8x8 subtiles and for each of these we want a 3 bit
// bitmask of the surrounding tiles. We do this by looking at the 3 least
// significant bits for the top left subtile and shift the mask to the right as we
// are going around the tile. This way we are "rotating" our bitmask. The result
// are our x offsets into ter257.pic
const buildCoastTile = (
  sprite: HTMLImageElement,
  bitmask: number
): HTMLCanvasElement => {
  const cached = coastTileCache.get(bitmask);

  if (cached) {
    return cached;
  }

  const topLeftSubtileOffset = bitmask & 7,
    topRightSubtileOffset = (bitmask >> 2) & 7,
    bottomRightSubtileOffset = (bitmask >> 4) & 7,
    bottomLeftSubtileOffset = ((bitmask >> 6) & 7) | ((bitmask & 1) << 2),
    image = s<HTMLCanvasElement>('<canvas height="16" width="16"></canvas>'),
    imageContext = image.getContext('2d') as CanvasRenderingContext2D;

  imageContext.drawImage(
    sprite,
    topLeftSubtileOffset << 4,
    0,
    8,
    8,
    0,
    0,
    8,
    8
  );
  imageContext.drawImage(
    sprite,
    (topRightSubtileOffset << 4) + 8,
    0,
    8,
    8,
    8,
    0,
    8,
    8
  );
  imageContext.drawImage(
    sprite,
    (bottomRightSubtileOffset << 4) + 8,
    8,
    8,
    8,
    8,
    8,
    8,
    8
  );
  imageContext.drawImage(
    sprite,
    bottomLeftSubtileOffset << 4,
    8,
    8,
    8,
    0,
    8,
    8,
    8
  );

  coastTileCache.set(bitmask, image);

  return image;
};

/**
 * The tile's own scenery: land/ocean, irrigation, terrain, improvements,
 * terrain features and goody huts.
 *
 * These were six separate world-sized canvases that the portal composited in
 * this order on every render, even though none of them is ever toggled
 * independently and they only change when a tile changes. Drawing them onto one
 * canvas in the same order is the same picture for a sixth of the memory and a
 * sixth of the compositing.
 */
export class Landscape extends TerrainAbstract {
  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    if (tile.terrain._ === 'Unknown') {
      return;
    }

    this.renderLand(tile, offsetX, offsetY);
    this.renderIrrigation(tile, offsetX, offsetY);
    this.renderTerrain(tile, offsetX, offsetY);
    this.renderImprovements(tile, offsetX, offsetY);
    this.renderFeatures(tile, offsetX, offsetY);
    this.renderGoodyHut(tile, offsetX, offsetY);
  }

  protected renderLand(tile: Tile, offsetX: number, offsetY: number): void {
    if (tile.isLand) {
      this.drawImage('terrain/land', offsetX, offsetY);

      return;
    }

    if (!tile.isWater) {
      return;
    }

    this.drawImage('terrain/ocean', offsetX, offsetY);

    if (!tile.isCoast) {
      return;
    }

    const sprite = this.getPreloadedImage(
        'terrain/coast_sprite'
      ) as HTMLImageElement,
      // formula from: http://forums.civfanatics.com/showpost.php?p=13507808&postcount=40
      // Build a bit mask of all 8 surrounding tiles, setting the bit if the tile is not an
      // ocean tile. Starting with the tile to the left as the least significant bit and
      // going clockwise
      bitmask =
        (this.world().getNeighbour(tile, 'w').isLand ? 1 : 0) |
        (this.world().getNeighbour(tile, 'nw').isLand ? 2 : 0) |
        (this.world().getNeighbour(tile, 'n').isLand ? 4 : 0) |
        (this.world().getNeighbour(tile, 'ne').isLand ? 8 : 0) |
        (this.world().getNeighbour(tile, 'e').isLand ? 16 : 0) |
        (this.world().getNeighbour(tile, 'se').isLand ? 32 : 0) |
        (this.world().getNeighbour(tile, 's').isLand ? 64 : 0) |
        (this.world().getNeighbour(tile, 'sw').isLand ? 128 : 0);

    // There is at least one surrounding tile that is not ocean, so we need
    // to render coast. The sprite check covers an early render reaching an
    // image that has not decoded yet, which would be an empty coast tile
    // cached for the rest of the session.
    if (bitmask > 0 && isDrawable(sprite)) {
      this.putImage(buildCoastTile(sprite, bitmask), offsetX, offsetY);
    }

    this.filterNeighbours(
      tile,
      (tile: Tile): boolean => tile.terrain._ === 'River'
    ).forEach((direction) =>
      this.drawImage(`terrain/river_mouth_${direction}`, offsetX, offsetY)
    );
  }

  protected renderIrrigation(
    tile: Tile,
    offsetX: number,
    offsetY: number
  ): void {
    const hasIrrigation = tile.improvements.some(
      (improvement: EntityInstance): boolean => improvement._ === 'Irrigation'
    );

    if (!hasIrrigation) {
      return;
    }

    this.drawImage(`improvements/irrigation`, offsetX, offsetY);
  }

  protected renderTerrain(tile: Tile, offsetX: number, offsetY: number): void {
    // Ocean is covered with the land/ocean stuff above and if we re-do here, we lose the coastline
    if (tile.terrain._ === 'Ocean') {
      return;
    }

    const adjoining = this.filterNeighbours(
      tile,
      (adjoiningTile: Tile): boolean =>
        (tile.terrain._ === 'River' && adjoiningTile.isWater) ||
        tile.terrain._ === adjoiningTile.terrain._
    ).join('');

    if (adjoining) {
      this.drawImage(
        `terrain/${tile.terrain._.toLowerCase()}_${adjoining}`,
        offsetX,
        offsetY
      );

      return;
    }

    this.drawImage(`terrain/${tile.terrain._.toLowerCase()}`, offsetX, offsetY);
  }

  protected renderImprovements(
    tile: Tile,
    offsetX: number,
    offsetY: number
  ): void {
    const improvements = tile.improvements.reduce(
      (
        state: ImprovementLookup,
        improvement: EntityInstance
      ): ImprovementLookup => {
        const improvementType = improvement._ as Improvement;

        if (!(improvementType in state)) {
          return state;
        }

        state[improvementType] = true;

        return state;
      },
      {
        Mine: false,
        Road: false,
        Railroad: false,
        Pollution: false,
      }
    );

    (['Mine', 'Pollution'] as (keyof ImprovementLookup)[]).forEach(
      (improvementName: keyof ImprovementLookup) => {
        if (improvements[improvementName]) {
          this.drawImage(
            `improvements/${improvementName.toLowerCase()}`,
            offsetX,
            offsetY
          );
        }
      }
    );

    // Can't have Railroad without Road!
    if (!improvements.Road) {
      return;
    }

    const neighbouringRoad = this.filterNeighbours(
        tile,
        (adjoiningTile: Tile): boolean =>
          adjoiningTile.improvements.some(
            (improvement: EntityInstance): boolean => improvement._ === 'Road'
          ),
        ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
      ),
      neighbouringRailroad = this.filterNeighbours(
        tile,
        (adjoiningTile: Tile): boolean =>
          !!adjoiningTile.city ||
          adjoiningTile.improvements.some(
            (improvement: EntityInstance): boolean =>
              improvement._ === 'Railroad'
          ),
        ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
      );

    neighbouringRoad.forEach((direction: NeighbourDirection): void => {
      if (!improvements.Railroad || !neighbouringRailroad.includes(direction)) {
        this.drawImage(`improvements/road_${direction}`, offsetX, offsetY);
      }
    });

    if (improvements.Railroad) {
      neighbouringRailroad.forEach((direction: NeighbourDirection): void =>
        this.drawImage(`improvements/railroad_${direction}`, offsetX, offsetY)
      );
    }

    if (neighbouringRoad.length === 0 && neighbouringRailroad.length === 0) {
      const center = Math.floor(this.tileSize() / 2) - this.scale();

      this.context().fillStyle = improvements.Railroad ? '#000' : '#8c5828';
      // `rect()` without a `beginPath()` appends to the path the last tile
      // left behind, so every `fill()` used to re-fill every isolated road
      // drawn so far.
      this.context().beginPath();
      this.context().rect(
        offsetX + center,
        offsetY + center,
        this.scale() * 2,
        this.scale() * 2
      );
      this.context().fill();
    }
  }

  protected renderFeatures(tile: Tile, offsetX: number, offsetY: number): void {
    tile.terrain.features.forEach((feature) => {
      const image = `terrain/${
        specialSprites[`${tile.terrain._}:${feature._}`] ??
        feature._.toLowerCase()
      }`;

      if (feature._ === 'Shield') {
        this.drawImage(image, offsetX, offsetY, {
          offsetX: 4 * this.scale(),
          offsetY: 4 * this.scale(),
        });

        return;
      }

      this.drawImage(image, offsetX, offsetY);
    });
  }

  protected renderGoodyHut(tile: Tile, offsetX: number, offsetY: number): void {
    if (tile.goodyHut === null) {
      return;
    }

    this.drawImage('map/hut', offsetX, offsetY);
  }
}

export default Landscape;
