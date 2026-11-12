import { Element, s } from '@dom111/element';
import { Unit as UnitData } from '@civ-clone/ui-protocol/types';
import {
  mapTileset,
  nativeTileSize,
  shownScale,
} from '@civ-clone/ui-assets/lib/tilesets';
import {
  Size,
  TilesetDescriptor,
} from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import renderUnit, {
  drawUnitStatus,
} from '@civ-clone/ui-assets/lib/renderUnit';
import imageSize from '@civ-clone/ui-assets/lib/imageSize';

/**
 * What a unit is shown on outside the map, in `tileset`'s native px: its tile, and as far above and left of it as the
 * tileset draws its units' sprites (Civ2's 64 × 48 units, 16 px above a 64 × 32 tile, are shown whole on a 64 × 48
 * box), with where the tile is in that box.
 */
export const unitBox = (
  tileset: TilesetDescriptor
): Size & { tileX: number; tileY: number } => {
  const { width, height } = nativeTileSize(tileset),
    { x, y } = tileset.units.anchor ?? { x: 0, y: 0 },
    tileX = Math.max(0, -x),
    tileY = Math.max(0, -y);

  return { width: width + tileX, height: height + tileY, tileX, tileY };
};

// A unit as a window shows it: on a tile of the tileset's, and the room above it its units' sprites take, `scale` times
//  its size (the interface's 2 unless asked).
const tileCanvas = (
  scale: number,
  tileset: TilesetDescriptor
): HTMLCanvasElement => {
  const { width, height } = unitBox(tileset);

  return s<HTMLCanvasElement>(
    `<canvas width="${width * scale}" height="${height * scale}"></canvas>`
  );
};

export class Unit extends Element {
  #scale: number = 2;
  #tileset: TilesetDescriptor;

  /**
   * `unit` drawn as `tileset` draws it, the game's map's (#97: the windows' units follow the map's pack, so a unit
   *  looks the same in both), `scale` times its size. The scales are Civ1's 16 px tile's: a pack drawn larger (Civ2's
   *  64 px) is shown no larger than at its own default scale.
   */
  constructor(
    unit: Pick<UnitData, '_' | 'player' | 'improvements' | 'busy'>,
    scale: number = 2,
    tileset: TilesetDescriptor = mapTileset()
  ) {
    const shownAt = shownScale(scale, tileset);

    super(tileCanvas(shownAt, tileset));

    this.#scale = shownAt;
    this.#tileset = tileset;

    this.build(unit);
  }

  build(unit: Pick<UnitData, '_' | 'player' | 'improvements' | 'busy'>) {
    const tileset = this.#tileset,
      tileSize = nativeTileSize(tileset),
      box = unitBox(tileset),
      unitCanvas = renderUnit(unit, tileset),
      [width, height] = imageSize(unitCanvas),
      context = this.element().getContext('2d')!,
      sizeX = this.size(width),
      sizeY = this.size(height),
      offsetX = Math.floor((this.size(box.width) - sizeX) / 2),
      offsetY = Math.floor((this.size(box.height) - sizeY) / 2);

    context.imageSmoothingEnabled = false;

    // A missing sprite gives a unit with no size, and `drawImage` throws on a zero-sized source.
    if (width > 0 && height > 0) {
      context.drawImage(unitCanvas, offsetX, offsetY, sizeX, sizeY);
    }

    drawUnitStatus(
      context,
      unit,
      this.size(box.tileX),
      this.size(box.tileY),
      this.#scale,
      tileSize,
      tileset
    );
  }

  override element(): HTMLCanvasElement {
    return super.element() as HTMLCanvasElement;
  }

  size(size: number): number {
    return size * this.#scale;
  }
}

export default Unit;
