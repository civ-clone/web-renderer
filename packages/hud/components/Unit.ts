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

type UnitShown = Pick<UnitData, '_' | 'player' | 'improvements' | 'busy'>;

// Each unit drawn for a window with the map's art, by its canvas: drawn again when that art changes (#1142).
const followingMap = new WeakMap<HTMLCanvasElement, Unit>();

/**
 * Draws again, with the map's art as it is now (`mapTileset`), every unit a window in `root` shows with it (#1142): the
 *  map's art was chosen again during a game (#1118). Each keeps its canvas, resized for the new art, so what holds it
 *  or listens on it is unchanged. A unit drawn with art of its own choosing is left as it is.
 */
export const redrawWindowUnits = (root: ParentNode = document): void =>
  root.querySelectorAll('canvas').forEach((canvas) => {
    followingMap.get(canvas)?.redraw();
  });

export class Unit extends Element {
  #scale: number = 2;
  #tileset: TilesetDescriptor;
  #unit: UnitShown;
  #scaleAsked: number;

  /**
   * `unit` drawn as `tileset` draws it, the game's map's (#97: the windows' units follow the map's pack, so a unit
   *  looks the same in both), `scale` times its size. The scales are Civ1's 16 px tile's: a pack drawn larger (Civ2's
   *  64 px) is shown no larger than at its own default scale.
   */
  constructor(
    unit: UnitShown,
    scale: number = 2,
    tileset: TilesetDescriptor | undefined = undefined
  ) {
    const drawnWith = tileset ?? mapTileset(),
      shownAt = shownScale(scale, drawnWith);

    super(tileCanvas(shownAt, drawnWith));

    this.#scale = shownAt;
    this.#scaleAsked = scale;
    this.#tileset = drawnWith;
    this.#unit = unit;

    if (tileset === undefined) {
      followingMap.set(this.element(), this);
    }

    this.build(unit);
  }

  /** Draws the unit again with the map's art as it is now (`redrawWindowUnits`), on its canvas resized for it. */
  redraw(): void {
    const tileset = mapTileset(),
      shownAt = shownScale(this.#scaleAsked, tileset),
      { width, height } = unitBox(tileset),
      canvas = this.element();

    this.#scale = shownAt;
    this.#tileset = tileset;

    // Set even when they're the same, which clears what was drawn.
    canvas.width = width * shownAt;
    canvas.height = height * shownAt;

    this.build(this.#unit);
  }

  build(unit: UnitShown) {
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
