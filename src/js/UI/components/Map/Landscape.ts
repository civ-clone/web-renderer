import { EntityInstance, NeighbourDirection, Tile } from '../../types';
import { CoastStrip } from '../../tilesets/TilesetDescriptor';
import TerrainAbstract from './TerrainAbstract';
import { isDrawable } from '../../lib/imageSize';
import { onPreloadedImagesChanged } from '../../lib/getPreloadedImage';
import { s } from '@dom111/element';

type Improvement = 'Mine' | 'Pollution' | 'Railroad' | 'Road';

type ImprovementLookup = {
  [key in Improvement]: boolean;
};

// The composed coast tile is a pure function of the tileset and the 8-neighbour
// bitmask, and is always built at the sprite's own size, so this tops out at 256
// small canvases a tileset instead of allocating one per coast tile per render.
const coastTileCache = new Map<string, HTMLCanvasElement>();

onPreloadedImagesChanged(() => coastTileCache.clear());

// We divide the tile into four quarters (8x8 in Civ1) and for each of these we
// want a 3 bit bitmask of the surrounding tiles. We do this by looking at the 3
// least significant bits for the top left quarter and shift the mask to the right
// as we are going around the tile. This way we are "rotating" our bitmask. The
// result are our column offsets into the strip (ter257.pic in Civ1), each column
// `cell` px wide.
const buildCoastTile = (
  sprite: CanvasImageSource,
  bitmask: number,
  tilesetId: string,
  { cell, quarter }: CoastStrip
): HTMLCanvasElement => {
  const key = `${tilesetId}:${bitmask}`,
    cached = coastTileCache.get(key);

  if (cached) {
    return cached;
  }

  const topLeftSubtileOffset = bitmask & 7,
    topRightSubtileOffset = (bitmask >> 2) & 7,
    bottomRightSubtileOffset = (bitmask >> 4) & 7,
    bottomLeftSubtileOffset = ((bitmask >> 6) & 7) | ((bitmask & 1) << 2),
    image = s<HTMLCanvasElement>(
      `<canvas height="${cell}" width="${cell}"></canvas>`
    ),
    imageContext = image.getContext('2d') as CanvasRenderingContext2D;

  imageContext.drawImage(
    sprite,
    topLeftSubtileOffset * cell,
    0,
    quarter,
    quarter,
    0,
    0,
    quarter,
    quarter
  );
  imageContext.drawImage(
    sprite,
    topRightSubtileOffset * cell + quarter,
    0,
    quarter,
    quarter,
    quarter,
    0,
    quarter,
    quarter
  );
  imageContext.drawImage(
    sprite,
    bottomRightSubtileOffset * cell + quarter,
    quarter,
    quarter,
    quarter,
    quarter,
    quarter,
    quarter,
    quarter
  );
  imageContext.drawImage(
    sprite,
    bottomLeftSubtileOffset * cell,
    quarter,
    quarter,
    quarter,
    0,
    quarter,
    quarter,
    quarter
  );

  coastTileCache.set(key, image);

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

    // Under the terrain, as Civ1's terrain leaves most of the land showing, unless the tileset's terrain covers it.
    const irrigationOverTerrain =
      this.tileset().families.irrigation.overTerrain === true;

    this.renderLand(tile, offsetX, offsetY);

    if (!irrigationOverTerrain) {
      this.renderIrrigation(tile, offsetX, offsetY);
    }

    this.renderTerrain(tile, offsetX, offsetY);

    if (irrigationOverTerrain) {
      this.renderIrrigation(tile, offsetX, offsetY);
    }

    this.renderImprovements(tile, offsetX, offsetY);
    this.renderFeatures(tile, offsetX, offsetY);
    this.renderGoodyHut(tile, offsetX, offsetY);
  }

  protected renderLand(tile: Tile, offsetX: number, offsetY: number): void {
    const tileset = this.tileset(),
      { base, coast, riverMouth } = tileset.families;

    if (tile.isLand) {
      this.drawImage(base.land, offsetX, offsetY);

      return;
    }

    if (!tile.isWater) {
      return;
    }

    this.drawImage(base.ocean, offsetX, offsetY);

    if (!tile.isCoast) {
      return;
    }

    const { order, strip } = coast,
      sprite = strip ? this.getPreloadedImage(strip.sprite) : null,
      // formula from: http://forums.civfanatics.com/showpost.php?p=13507808&postcount=40
      // Build a bit mask of all 8 surrounding tiles, setting the bit if the tile is not an
      // ocean tile, in the order the tileset gives, least significant first. Civ1's starts
      // with the tile to the left and goes clockwise, as its coast sprite is laid out.
      bitmask = order.reduce(
        (bitmask: number, direction: string, bit: number): number =>
          this.world().getNeighbour(tile, direction as NeighbourDirection)
            .isLand
            ? bitmask | (1 << bit)
            : bitmask,
        0
      );

    // There is at least one surrounding tile that is not ocean, so we need
    // to render coast. The sprite check covers a strip that is missing, which
    // would be an empty coast tile cached for the rest of the session. Only a
    // coast cut from one strip, as Civ1's is, can be drawn yet (#92).
    if (bitmask > 0 && strip && sprite && isDrawable(sprite)) {
      this.putImage(
        buildCoastTile(sprite, bitmask, tileset.id, strip),
        offsetX,
        offsetY
      );
    }

    this.drawFamily(
      riverMouth,
      this.filterNeighbours(
        tile,
        (tile: Tile): boolean => tile.terrain._ === 'River',
        this.familyDirections(riverMouth)
      ),
      {},
      offsetX,
      offsetY
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

    this.drawFamily(
      this.tileset().families.irrigation,
      [],
      {},
      offsetX,
      offsetY
    );
  }

  protected renderTerrain(tile: Tile, offsetX: number, offsetY: number): void {
    const {
        families: { terrain },
        names,
      } = this.tileset(),
      name = tile.terrain._;

    // The terrains the base and the coast already draw (Civ1's Ocean): drawn again here, they would hide the coastline.
    if (terrain.skip?.includes(name)) {
      return;
    }

    // What joins up with this terrain: the same terrain, unless the tileset says otherwise (`@water` is any water).
    const matches = terrain.matches?.[name] ?? [name];

    this.drawFamily(
      terrain,
      this.filterNeighbours(
        tile,
        (adjoiningTile: Tile): boolean =>
          matches.some((match) =>
            match === '@water'
              ? adjoiningTile.isWater
              : adjoiningTile.terrain._ === match
          ),
        this.familyDirections(terrain)
      ),
      { terrain: names.terrain[name] ?? name.toLowerCase() },
      offsetX,
      offsetY
    );
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

    const { mine, pollution, road, railroad } = this.tileset().families;

    if (improvements.Mine) {
      this.drawFamily(mine, [], {}, offsetX, offsetY);
    }

    if (improvements.Pollution) {
      this.drawFamily(pollution, [], {}, offsetX, offsetY);
    }

    // Can't have Railroad without Road!
    if (!improvements.Road) {
      return;
    }

    // A road or railroad joins its neighbours every way the tileset says, as the world's topology names them (#88).
    const neighbouringRoad = this.filterNeighbours(
        tile,
        (adjoiningTile: Tile): boolean =>
          adjoiningTile.improvements.some(
            (improvement: EntityInstance): boolean => improvement._ === 'Road'
          ),
        this.familyDirections(road)
      ),
      // Looked for on a road too: a road beside a railroad or a city is not on its own.
      neighbouringRailroad = this.filterNeighbours(
        tile,
        (adjoiningTile: Tile): boolean =>
          !!adjoiningTile.city ||
          adjoiningTile.improvements.some(
            (improvement: EntityInstance): boolean =>
              improvement._ === 'Railroad'
          ),
        this.familyDirections(railroad)
      );

    // No road is drawn under a railroad going the same way.
    this.drawFamily(
      road,
      neighbouringRoad.filter(
        (direction: NeighbourDirection): boolean =>
          !improvements.Railroad || !neighbouringRailroad.includes(direction)
      ),
      {},
      offsetX,
      offsetY,
      false
    );

    if (improvements.Railroad) {
      this.drawFamily(
        railroad,
        neighbouringRailroad,
        {},
        offsetX,
        offsetY,
        false
      );
    }

    // A road or railroad that joins nothing is drawn on its own.
    if (neighbouringRoad.length > 0 || neighbouringRailroad.length > 0) {
      return;
    }

    this.drawFamily(
      improvements.Railroad ? railroad : road,
      [],
      {},
      offsetX,
      offsetY
    );
  }

  protected renderFeatures(tile: Tile, offsetX: number, offsetY: number): void {
    const {
      families: { special },
      names,
    } = this.tileset();

    tile.terrain.features.forEach((feature) => {
      // Civ1 gives Forest and Tundra the same special, Game, but draws it as a doe on Forest and an antlered beast on
      //  Tundra (#69): the tileset names the ones not named after the feature, by `Terrain:Feature`.
      const anchor = special.anchors?.[feature._];

      this.drawFamily(
        special,
        [],
        {
          special:
            names.special[`${tile.terrain._}:${feature._}`] ??
            feature._.toLowerCase(),
        },
        offsetX + (anchor?.x ?? 0) * this.scale(),
        offsetY + (anchor?.y ?? 0) * this.scale()
      );
    });
  }

  protected renderGoodyHut(tile: Tile, offsetX: number, offsetY: number): void {
    if (tile.goodyHut === null) {
      return;
    }

    this.drawFamily(this.tileset().families.hut, [], {}, offsetX, offsetY);
  }
}

export default Landscape;
