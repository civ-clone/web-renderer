import { Element, s } from '@dom111/element';
import { Unit as UnitData } from '@civ-clone/ui-protocol/types';
import currentTileset, {
  nativeTileSize,
} from '@civ-clone/ui-assets/lib/tilesets';
import renderUnit, {
  drawUnitStatus,
} from '@civ-clone/ui-assets/lib/renderUnit';
import imageSize from '@civ-clone/ui-assets/lib/imageSize';

// A unit as a window shows it: on a tile of the tileset's, `scale` times its size (the interface's 2 unless asked).
const tileCanvas = (scale: number): HTMLCanvasElement => {
  const size = nativeTileSize(currentTileset()) * scale;

  return s<HTMLCanvasElement>(
    `<canvas width="${size}" height="${size}"></canvas>`
  );
};

export class Unit extends Element {
  #scale: number = 2;
  #tileSize: number = nativeTileSize(currentTileset());

  constructor(
    unit: Pick<UnitData, '_' | 'player' | 'improvements' | 'busy'>,
    scale: number = 2
  ) {
    super(tileCanvas(scale));

    this.#scale = scale;

    this.build(unit);
  }

  build(unit: Pick<UnitData, '_' | 'player' | 'improvements' | 'busy'>) {
    const unitCanvas = renderUnit(unit),
      [width, height] = imageSize(unitCanvas),
      context = this.element().getContext('2d')!,
      sizeX = this.size(width),
      sizeY = this.size(height),
      offsetX = Math.floor((this.size(this.#tileSize) - sizeX) / 2),
      offsetY = Math.floor((this.size(this.#tileSize) - sizeY) / 2);

    context.imageSmoothingEnabled = false;

    context.drawImage(unitCanvas, offsetX, offsetY, sizeX, sizeY);

    drawUnitStatus(context, unit, 0, 0, this.#scale, this.#tileSize);
  }

  override element(): HTMLCanvasElement {
    return super.element() as HTMLCanvasElement;
  }

  size(size: number): number {
    return size * this.#scale;
  }
}

export default Unit;
