import { Element, s } from '@dom111/element';
import { Unit as UnitData } from '../types';
import renderUnit from '../lib/renderUnit';

export class Unit extends Element {
  #scale: number = 2;

  constructor(unit: UnitData, scale: number = 2) {
    super(s<HTMLCanvasElement>('<canvas width="32" height="32"></canvas>'));

    this.#scale = scale;

    this.build(unit);
  }

  build(unit: UnitData) {
    const unitCanvas = renderUnit(unit),
      context = this.element().getContext('2d')!,
      sizeX = this.size(unitCanvas.width as number),
      sizeY = this.size(unitCanvas.height as number),
      offsetX = Math.floor((this.size(16) - sizeX) / 2),
      offsetY = Math.floor((this.size(16) - sizeY) / 2);

    context.imageSmoothingEnabled = false;

    context.drawImage(unitCanvas, offsetX, offsetY, sizeX, sizeY);
  }

  element(): HTMLCanvasElement {
    return super.element() as HTMLCanvasElement;
  }

  size(size: number): number {
    return size * this.#scale;
  }
}

export default Unit;
