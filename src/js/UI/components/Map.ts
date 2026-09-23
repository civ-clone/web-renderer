import { NeighbourDirection, Tile } from '../types';
import { Rect, repeatOffsets, tileRange } from '../lib/viewport';
import {
  getPreloadedImage,
  setPreloadContainer,
} from '../lib/getPreloadedImage';
import World from './World';
import { imageSize } from '../lib/imageSize';
import replaceColours from '../lib/replaceColours';
import { s } from '@dom111/element';

export interface IMap {
  context(): CanvasRenderingContext2D;
  render(...args: any[]): void;
  scale(): number;
  tileSize(): number;
  world(): World;
}

interface DrawImageOptions {
  augment?: (image: CanvasImageSource) => CanvasImageSource;
  offsetX?: number;
  offsetY?: number;
}

/**
 * One layer of the map.
 *
 * A layer's canvas is a window on the world rather than the whole of it: it is
 * the size of the portal that composites it, and `#originX`/`#originY` are the
 * world pixel that sits at its top left corner. A world canvas was ~19 MB at
 * 80x60 scale 2 and there are several of them; the window is the size of the
 * portal whatever the world costs, so a bigger map costs nothing extra.
 *
 * Because the window moves, a tile no longer has one fixed place on the canvas
 * — and because the world wraps, it can have more than one, or none. Subclasses
 * are given the places to draw in rather than working them out from the tile's
 * co-ordinates: `drawTile(tile, offsetX, offsetY)` is called once per place the
 * tile lands, with the offsets already in canvas pixels.
 *
 * Layers also record what they changed, so the portal can composite the parts
 * of itself that moved rather than all of it.
 */
export class Map implements IMap {
  #canvas: HTMLCanvasElement;
  #context: CanvasRenderingContext2D;
  #dirty: Rect[] = [];
  #originX: number = 0;
  #originY: number = 0;
  // Set when what is on the canvas was drawn at a scale it no longer has, so
  // the next viewport change has to redraw rather than scroll.
  #stale: boolean = false;
  #visible: boolean = true;
  #scale: number;
  #tileSize: number;
  #world: World;

  constructor(
    world: World,
    scale: number = 2,
    tileSize: number = 16,
    canvas: HTMLCanvasElement = s<HTMLCanvasElement>('<canvas></canvas>')
  ) {
    this.#canvas = canvas;
    this.#world = world;
    this.#tileSize = tileSize;
    this.#scale = scale;

    this.#context = this.#canvas.getContext('2d') as CanvasRenderingContext2D;
    setPreloadContainer(document.querySelector('#preload')!);
  }

  canvas(): HTMLCanvasElement {
    return this.#canvas;
  }

  clear(): void {
    this.context().clearRect(0, 0, this.canvas().width, this.canvas().height);

    this.markDirty(0, 0, this.canvas().width, this.canvas().height);
  }

  /**
   * Whether the portal draws this layer at all. An overview rendered at its own
   * scale rides in the layer list to be fed tile updates, but is never
   * composited onto the map.
   */
  composited(): boolean {
    return true;
  }

  context(): CanvasRenderingContext2D {
    return this.#context;
  }

  /** What has changed on this canvas since `clearDirty()`. */
  dirtyRects(): Rect[] {
    return this.#dirty;
  }

  clearDirty(): void {
    this.#dirty = [];
  }

  render(tiles: Tile[] = this.visibleTiles()): void {
    this.clear();

    tiles.forEach(({ x, y }: Tile) => this.renderTile(this.world().get(x, y)));
  }

  renderTile(tile: Tile): void {
    const size = this.tileSize();

    this.placements(tile).forEach(([offsetX, offsetY]) => {
      this.context().clearRect(offsetX, offsetY, size, size);

      // The square that was cleared. Anything drawn past it is marked by
      // `putImage` as it is drawn, so the sprites' own sizes and offsets do not
      // have to be second-guessed here.
      this.markDirty(offsetX, offsetY, size, size);

      this.drawTile(tile, offsetX, offsetY);
    });
  }

  scale(): number {
    return this.#scale;
  }

  /**
   * Draw at `scale` from now on. The canvas is redrawn the next time the
   * portal points it at a viewport, since the viewport moves with the scale.
   */
  setScale(scale: number): void {
    if (scale === this.#scale) {
      return;
    }

    this.#scale = scale;
    this.#stale = true;
  }

  /**
   * Point this layer at a window on the world, resizing or scrolling it to
   * match. The portal calls this; nothing else should need to.
   */
  setViewport(
    originX: number,
    originY: number,
    width: number,
    height: number
  ): void {
    if (
      this.#stale ||
      this.#canvas.width !== width ||
      this.#canvas.height !== height
    ) {
      // Resizing a canvas clears it, so there is nothing to keep — and a
      // canvas drawn at another scale has nothing worth keeping either.
      if (this.#canvas.width !== width || this.#canvas.height !== height) {
        this.#canvas.width = width;
        this.#canvas.height = height;
      }

      this.#stale = false;
      this.#originX = originX;
      this.#originY = originY;

      this.render();

      return;
    }

    if (originX === this.#originX && originY === this.#originY) {
      return;
    }

    this.scrollTo(originX, originY);
  }

  tileSize(): number {
    return this.#tileSize * this.#scale;
  }

  update(tilesToUpdate: Tile[]): void {
    tilesToUpdate.forEach(({ x, y }: Tile) =>
      this.renderTile(this.world().get(x, y))
    );
  }

  world(): World {
    return this.#world;
  }

  /** Draw `tile` at one of the places it lands on this canvas. */
  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {}

  protected drawImage(
    path: string,
    offsetX: number,
    offsetY: number,
    options: DrawImageOptions = {}
  ): void {
    const image = this.getPreloadedImage(path);

    this.putImage(
      options.augment ? options.augment(image) : image,
      offsetX + (options.offsetX ?? 0),
      offsetY + (options.offsetY ?? 0)
    );
  }

  protected filterNeighbours(
    tile: Tile,
    filter: (tile: Tile) => boolean,
    directions: NeighbourDirection[] = ['n', 'e', 's', 'w']
  ): NeighbourDirection[] {
    return directions.filter((direction: NeighbourDirection): boolean =>
      filter(this.#world.getNeighbour(tile, direction))
    );
  }

  protected getPreloadedImage(path: string): CanvasImageSource {
    return getPreloadedImage(path);
  }

  protected markDirty(
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const left = Math.max(0, Math.floor(x)),
      top = Math.max(0, Math.floor(y)),
      right = Math.min(this.#canvas.width, Math.ceil(x + width)),
      bottom = Math.min(this.#canvas.height, Math.ceil(y + height));

    if (right <= left || bottom <= top) {
      return;
    }

    this.#dirty.push({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }

  /**
   * What has to be recomposited when this layer is shown or hidden. The whole
   * canvas, unless the layer knows it only ever draws in one small place.
   */
  protected markContentDirty(): void {
    this.markDirty(0, 0, this.#canvas.width, this.#canvas.height);
  }

  protected originX(): number {
    return this.#originX;
  }

  protected originY(): number {
    return this.#originY;
  }

  /**
   * How far past a tile's own square, in px, this layer's drawing can reach, so
   * a tile just off the canvas that still draws on to it is not culled.
   *
   * A whole tile by default. Not one sprite in the tileset reaches that far —
   * the worst is a yield icon about nine pixels over at scale 2 — but the
   * margin is a ring of tiles at the edge of the viewport rather than anything
   * per-frame, and it means a theme that moves a sprite cannot quietly clip it.
   */
  protected overhang(): number {
    return this.tileSize();
  }

  /** Every place `tile` lands on this canvas; usually one, often none. */
  protected placements(tile: Tile): [number, number][] {
    const size = this.tileSize(),
      overhang = this.overhang(),
      columns = repeatOffsets(
        tile.x * size - this.#originX,
        this.#world.width() * size,
        this.#canvas.width,
        size,
        overhang
      ),
      rows = repeatOffsets(
        tile.y * size - this.#originY,
        this.#world.height() * size,
        this.#canvas.height,
        size,
        overhang
      ),
      placements: [number, number][] = [];

    columns.forEach((offsetX) =>
      rows.forEach((offsetY) => placements.push([offsetX, offsetY]))
    );

    return placements;
  }

  protected putImage(
    image: CanvasImageSource,
    offsetX: number,
    offsetY: number
  ): void {
    const [width, height] = imageSize(image);

    // The preload is asynchronous, so an early render can reach an image that
    // has not decoded; `drawImage` throws on a zero-sized source.
    if (width === 0 || height === 0) {
      return;
    }

    this.#context.imageSmoothingEnabled = false;

    this.#context.drawImage(
      image,
      offsetX,
      offsetY,
      width * this.#scale,
      height * this.#scale
    );

    // Exactly what was drawn, which is how a sprite that reaches past its tile
    // — the city glyph, a yield icon, the copy behind a stack — gets into the
    // portal's composite without every layer having to declare its own reach.
    this.markDirty(offsetX, offsetY, width * this.#scale, height * this.#scale);
  }

  protected replaceColours(
    image: CanvasImageSource,
    source: string[],
    replacement: string[]
  ) {
    return replaceColours(image, source, replacement);
  }

  /** Redraw one region of the canvas, leaving the rest of it alone. */
  protected renderRegion(rect: Rect): void {
    const context = this.context();

    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y, rect.width, rect.height);
    // Tiles overlapping the region draw outside it too, and outside it the
    // canvas is still good, so the clip is what keeps a partial redraw from
    // being a wrong one.
    context.clip();

    this.tilesIn(rect).forEach((tile) => this.renderTile(tile));

    context.restore();
  }

  /**
   * Move the window without redrawing what is still in it.
   *
   * The centre moves in whole tiles, so the shift is a whole number of pixels
   * and the overlap can simply be blitted across; only the strips the move
   * uncovers have to be drawn.
   */
  protected scrollTo(originX: number, originY: number): void {
    const deltaX = this.#originX - originX,
      deltaY = this.#originY - originY,
      width = this.#canvas.width,
      height = this.#canvas.height;

    this.setOrigin(originX, originY);

    if (Math.abs(deltaX) >= width || Math.abs(deltaY) >= height) {
      this.render();

      return;
    }

    // `copy` leaves the canvas showing the source alone, which both moves the
    // overlap and clears the strips the move uncovers.
    this.#context.globalCompositeOperation = 'copy';
    this.#context.drawImage(this.#canvas, deltaX, deltaY);
    this.#context.globalCompositeOperation = 'source-over';

    const keptX = deltaX > 0 ? deltaX : 0,
      keptWidth = width - Math.abs(deltaX),
      exposed: Rect[] = [];

    if (deltaX > 0) {
      exposed.push({ x: 0, y: 0, width: deltaX, height });
    }

    if (deltaX < 0) {
      exposed.push({ x: width + deltaX, y: 0, width: -deltaX, height });
    }

    // The horizontal strip stops where the vertical one starts, so the two
    // never cover the same pixel and no tile is drawn into twice.
    if (deltaY > 0) {
      exposed.push({ x: keptX, y: 0, width: keptWidth, height: deltaY });
    }

    if (deltaY < 0) {
      exposed.push({
        x: keptX,
        y: height + deltaY,
        width: keptWidth,
        height: -deltaY,
      });
    }

    exposed.forEach((rect) => this.renderRegion(rect));

    this.markDirty(0, 0, width, height);
  }

  protected setCanvasSize(): void {
    this.#canvas.height = this.#world.height() * this.tileSize();
    this.#canvas.width = this.#world.width() * this.tileSize();
  }

  protected setOrigin(originX: number, originY: number): void {
    this.#originX = originX;
    this.#originY = originY;
  }

  /** The tiles that reach a region of this canvas. */
  protected tilesIn(rect: Rect): Tile[] {
    const size = this.tileSize(),
      overhang = this.overhang(),
      columns = tileRange(
        this.#originX + rect.x,
        rect.width,
        size,
        overhang,
        this.#world.width()
      ),
      rows = tileRange(
        this.#originY + rect.y,
        rect.height,
        size,
        overhang,
        this.#world.height()
      ),
      tiles: Tile[] = [];

    columns.forEach((x) =>
      rows.forEach((y) => tiles.push(this.#world.get(x, y)))
    );

    return tiles;
  }

  protected visibleTiles(): Tile[] {
    return this.tilesIn({
      x: 0,
      y: 0,
      width: this.#canvas.width,
      height: this.#canvas.height,
    });
  }

  isVisible(): boolean {
    return this.#visible;
  }

  setVisible(visible: boolean): void {
    if (visible === this.#visible) {
      return;
    }

    this.#visible = visible;

    this.markContentDirty();
  }
}

export default Map;
