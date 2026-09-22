import Overview from './Map/Overview';
import Portal from './Portal';
import World from './World';
import { Coordinate } from '../types';
import { on } from '@dom111/element';

export type ActiveUnitMarker = () => Coordinate | null;

export class Minimap {
  #activeUnitMarker: ActiveUnitMarker;
  #context: CanvasRenderingContext2D;
  #element: HTMLCanvasElement;
  #layer: Overview;
  #portal: Portal;
  #world: World;

  constructor(
    element: HTMLCanvasElement,
    world: World,
    portal: Portal,
    layer: Overview,
    activeUnitMarker: ActiveUnitMarker = () => null
  ) {
    this.#element = element;
    this.#world = world;
    this.#portal = portal;
    this.#layer = layer;
    this.#activeUnitMarker = activeUnitMarker;

    this.#context = this.#element.getContext('2d')!;

    on(this.#element, 'click', (event) => {
      // `offsetX`/`offsetY` are already relative to the canvas, and the CSS
      // size is what was clicked, which is not the backing store's size.
      const tileX = Math.floor(
          (event.offsetX / this.#element.offsetWidth) * this.#world.width()
        ),
        tileY = Math.floor(
          (event.offsetY / this.#element.offsetHeight) * this.#world.height()
        );

      this.#portal.setCenter(tileX, tileY);
      this.update();
    });
  }

  update(): void {
    const canvas = this.#layer.canvas(),
      tileWidth = canvas.width / this.#world.width(),
      tileHeight = canvas.height / this.#world.height();

    // The layer is drawn one to one and the element is scaled by CSS, so the
    // minimap fills its slot without a fractional downscale of the tiles.
    if (
      this.#element.width !== canvas.width ||
      this.#element.height !== canvas.height
    ) {
      this.#element.width = canvas.width;
      this.#element.height = canvas.height;
    }

    this.#context.clearRect(0, 0, canvas.width, canvas.height);
    this.#context.drawImage(canvas, 0, 0);

    // Note the minimap deliberately ignores the layers' `isVisible()`: showing
    // or hiding yields, units or city names is a view mode for the map, and the
    // minimap is an overview that should always show what is there.

    this.drawActiveUnit(tileWidth, tileHeight);
    this.drawViewport(tileWidth, tileHeight);
  }

  protected drawActiveUnit(tileWidth: number, tileHeight: number): void {
    const marker = this.#activeUnitMarker();

    if (marker === null) {
      return;
    }

    // Drawn here rather than into the layer because it flashes: the layer is a
    // per-tile cache of things that change when a tile changes, and this
    // changes twice a second. The caller decides which phase of the flash this
    // is by returning `null` for the off phase.
    this.#context.fillStyle = '#fff';
    this.#context.fillRect(
      Math.floor(marker.x * tileWidth),
      Math.floor(marker.y * tileHeight),
      Math.max(1, Math.round(tileWidth)),
      Math.max(1, Math.round(tileHeight))
    );
  }

  protected drawViewport(tileWidth: number, tileHeight: number): void {
    const worldWidth = this.#world.width(),
      worldHeight = this.#world.height(),
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
