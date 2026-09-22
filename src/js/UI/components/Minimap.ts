import Map from './Map';
import Portal from './Portal';
import World from './World';
import { on } from '@dom111/element';

export class Minimap {
  #context: CanvasRenderingContext2D;
  #element: HTMLCanvasElement;
  #layers: Map[];
  #portal: Portal;
  #world: World;

  constructor(
    element: HTMLCanvasElement,
    world: World,
    portal: Portal,
    ...layers: Map[]
  ) {
    this.#element = element;
    this.#world = world;
    this.#portal = portal;
    this.#layers = layers;

    this.#context = this.#element.getContext('2d')!;

    on(this.#element, 'click', (event) => {
      const x = event.offsetX - this.#element.offsetLeft,
        y = event.offsetY - this.#element.offsetTop,
        tileX = Math.ceil(
          (x / this.#element.offsetWidth) * this.#world.width()
        ),
        tileY = Math.ceil(
          (y / this.#element.offsetHeight) * this.#world.height()
        );

      this.#portal.setCenter(tileX, tileY);
      this.update();
    });
  }

  update(): void {
    const targetHeight =
      this.#layers[0].canvas().height * (190 / this.#layers[0].canvas().width);

    this.#element.height = targetHeight;
    this.#context.clearRect(0, 0, 190, targetHeight);

    this.#layers.forEach((layer) =>
      this.#context.drawImage(layer.canvas(), 0, 0, 190, targetHeight)
    );

    const worldWidth = this.#world.width(),
      worldHeight = this.#world.height(),
      tileWidth = 190 / worldWidth,
      tileHeight = targetHeight / worldHeight,
      [start, end] = this.#portal.rawVisibleRange(),
      // `rawVisibleRange()` is deliberately unwrapped, so the box can start off
      // the left or top edge and can run past the right or bottom one. The
      // world wraps, so whatever runs off one side has to come back on the
      // other: the box is drawn once from its wrapped origin and again a world
      // earlier on whichever axis overflows. The copies' outer edges fall off
      // the canvas, leaving the two halves to meet without a seam.
      tilesWide = Math.min(end.x - start.x, worldWidth),
      tilesHigh = Math.min(end.y - start.y, worldHeight),
      originX = ((start.x % worldWidth) + worldWidth) % worldWidth,
      originY = ((start.y % worldHeight) + worldHeight) % worldHeight,
      columns =
        originX + tilesWide > worldWidth
          ? [originX, originX - worldWidth]
          : [originX],
      rows =
        originY + tilesHigh > worldHeight
          ? [originY, originY - worldHeight]
          : [originY];

    this.#context.lineWidth = 1;
    this.#context.strokeStyle = '#fff';
    this.#context.fillStyle = 'rgba(255, 255, 255, .2)';

    columns.forEach((x) =>
      rows.forEach((y) => {
        // Both edges are floored rather than the width being floored on its
        // own, so a box keeps the tiles it covers however it is split.
        const left = Math.floor(x * tileWidth),
          top = Math.floor(y * tileHeight);

        this.#context.beginPath();
        this.#context.rect(
          left,
          top,
          Math.floor((x + tilesWide) * tileWidth) - left,
          Math.floor((y + tilesHigh) * tileHeight) - top
        );
        this.#context.stroke();
        this.#context.fill();
      })
    );
  }
}

export default Minimap;
