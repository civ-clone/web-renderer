import { NeighbourDirection, Tile } from '../types';
import { Placement, Projection, Reach } from '../lib/projection';
import {
  Rect,
  mergeRects,
  rectsIntersect,
  repeatOffsets,
  wrapIndices,
} from '../lib/viewport';
import {
  getPreloadedImage,
  setPreloadContainer,
} from '../lib/getPreloadedImage';
import World from './World';
import { TilesetDescriptor } from '../tilesets/TilesetDescriptor';
import currentTileset from '../lib/tilesets';
import { imageSize } from '../lib/imageSize';
import projectionFor from '../lib/projectionFor';
import replaceColours from '../lib/replaceColours';
import { s } from '@dom111/element';

export interface IMap {
  context(): CanvasRenderingContext2D;
  render(...args: any[]): void;
  scale(): number;
  tileSize(): number;
  world(): World;
}

/** One place a tile is drawn on a layer's canvas. */
export type TilePlacement = Placement & { tile: Tile };

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
 *
 * On the square grid a layer that draws each tile inside its own box can
 * clear a tile and draw it again on its own. Where the projection's tiles
 * overlap their neighbours (#91), or the layer draws past a tile's box (#486),
 * nothing is cleared per tile: a changed tile's box, and as far past it as the
 * layer draws (`reach()`), is cleared once and every tile that reaches it is
 * drawn again, back to front, clipped to it.
 */
export class Map implements IMap {
  #canvas: HTMLCanvasElement;
  // The region being redrawn, while it is: nothing outside it changes, so nothing outside it is marked dirty.
  #clip: Rect | null = null;
  #context: CanvasRenderingContext2D;
  #dirty: Rect[] = [];
  #originX: number = 0;
  #originY: number = 0;
  // Made when first asked for, and again after the scale or the vertical wrap changes. Not in the constructor:
  //  `Overview` keeps a tile size of its own, and a subclass's `tileSize()` can't be relied on from here.
  #projection: Projection | null = null;
  // Set when what is on the canvas was drawn at a scale it no longer has, so
  // the next viewport change has to redraw rather than scroll.
  #stale: boolean = false;
  // Whether a tile is also drawn a world's height above and below itself.
  // Off when the portal stops at the poles, so nothing from one pole — a city
  // name hanging below the last row, say — reaches past the other.
  #wrapVertical: boolean = true;
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

    if (this.#byRegion()) {
      this.placementsOf(
        tiles.map(({ x, y }: Tile) => this.world().get(x, y))
      ).forEach((placement) => this.paint(placement));

      return;
    }

    tiles.forEach(({ x, y }: Tile) => this.renderTile(this.world().get(x, y)));
  }

  renderTile(tile: Tile): void {
    if (this.#byRegion()) {
      this.redrawTiles([tile]);

      return;
    }

    const { width, height } = this.projection().footprint();

    this.placements(tile).forEach(([offsetX, offsetY]) => {
      this.context().clearRect(offsetX, offsetY, width, height);

      // The box that was cleared. Anything drawn past it is marked by
      // `putImage` as it is drawn, so the sprites' own sizes and offsets do not
      // have to be second-guessed here.
      this.markDirty(offsetX, offsetY, width, height);

      this.#draw(tile, offsetX, offsetY);
    });
  }

  scale(): number {
    return this.#scale;
  }

  /**
   * Whether to draw each tile again a world's height away, as a map that
   * wraps over the poles needs. Like `setScale`, it takes effect on the next
   * viewport change.
   */
  setWrapVertical(wrap: boolean): void {
    if (wrap === this.#wrapVertical) {
      return;
    }

    this.#wrapVertical = wrap;
    this.#projection = null;
    this.#stale = true;
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
    this.#projection = null;
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

      this.#originX = originX;
      this.#originY = originY;

      this.render();

      // Only once it's drawn: a render that throws leaves the layer stale, so the next viewport change redraws it.
      this.#stale = false;

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

  /** The tileset this layer draws with: where its tiles go, and the sprites and how they are put together (#56). */
  protected tileset(): TilesetDescriptor {
    return currentTileset();
  }

  update(tilesToUpdate: Tile[]): void {
    if (this.#byRegion()) {
      this.redrawTiles(tilesToUpdate);

      return;
    }

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

  // The directions from `tile` whose neighbour passes `filter`, in the order given: by default the ones that share an
  //  edge, as the world's topology lists them (#88).
  protected filterNeighbours(
    tile: Tile,
    filter: (tile: Tile) => boolean,
    directions: readonly NeighbourDirection[] = this.#world
      .topology()
      .edgeDirections()
  ): NeighbourDirection[] {
    return directions.filter((direction: NeighbourDirection): boolean =>
      filter(this.#world.getNeighbour(tile, direction))
    );
  }

  protected getPreloadedImage(path: string): CanvasImageSource {
    return getPreloadedImage(path, this.tileset());
  }

  protected markDirty(
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    let left = Math.max(0, Math.floor(x)),
      top = Math.max(0, Math.floor(y)),
      right = Math.min(this.#canvas.width, Math.ceil(x + width)),
      bottom = Math.min(this.#canvas.height, Math.ceil(y + height));

    // A sprite drawn into a region being redrawn is mostly clipped away; only what reached the canvas changed.
    if (this.#clip !== null) {
      left = Math.max(left, this.#clip.x);
      top = Math.max(top, this.#clip.y);
      right = Math.min(right, this.#clip.x + this.#clip.width);
      bottom = Math.min(bottom, this.#clip.y + this.#clip.height);
    }

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

  /**
   * Draw one place a tile lands, over what is there: on a projection whose tiles overlap, clearing its box would cut
   *  into the tiles behind it.
   */
  protected paint({ tile, px, py }: TilePlacement): void {
    this.#draw(tile, px, py);
  }

  /**
   * Every place `tiles` land on this canvas, back to front, as the projection orders them: by place rather than by
   *  tile, as a tile on the seam can be in front of one neighbour and behind another. Only the places whose box and
   *  reach meet `within`, if it is given.
   */
  protected placementsOf(
    tiles: Tile[],
    within: Rect | null = null
  ): TilePlacement[] {
    const projection = this.projection(),
      placements: TilePlacement[] = [];

    tiles.forEach((tile) =>
      this.placements(tile).forEach(([px, py]) => {
        if (within !== null && !rectsIntersect(within, this.#reachOf(px, py))) {
          return;
        }

        placements.push({ tile, x: tile.x, y: tile.y, px, py });
      })
    );

    return placements.sort((a, b) => projection.compareDrawOrder(a, b));
  }

  /** Every place `tile` lands on this canvas; usually one, often none. */
  protected placements(tile: Tile): [number, number][] {
    const projection = this.projection(),
      { width, height } = projection.footprint(),
      period = projection.wrapPeriod(),
      [tileX, tileY] = projection.tileToPixel(tile.x, tile.y),
      overhang = this.overhang(),
      columns = repeatOffsets(
        tileX - this.#originX,
        period.x,
        this.#canvas.width,
        width,
        overhang
      ),
      // A world that doesn't wrap over the poles has the tile only where it
      // is, if that is on the canvas at all.
      rows = repeatOffsets(
        tileY - this.#originY,
        period.y ?? projection.worldSize().height,
        this.#canvas.height,
        height,
        overhang
      ).filter(
        (offsetY) => period.y !== null || offsetY === tileY - this.#originY
      ),
      placements: [number, number][] = [];

    columns.forEach((offsetX) =>
      rows.forEach((offsetY) => placements.push([offsetX, offsetY]))
    );

    return placements;
  }

  /** Where tiles go on the world, in pixels, at this layer's tile size. */
  protected projection(): Projection {
    if (this.#projection === null) {
      this.#projection = projectionFor(
        this.tileset(),
        this.#world,
        this.tileSize(),
        this.#wrapVertical
      );
    }

    return this.#projection;
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

  /**
   * How far past a tile's sprite box anything this layer draws for the tile can reach, px per side: the projection's
   *  own reach, and more for a layer that draws past the box. Where it is more than nothing, or the projection's tiles
   *  overlap, an update redraws this much around a changed tile, so it has to cover everything the tile draws;
   *  `overhang()` has to be at least as much on every side.
   */
  protected reach(): Reach {
    return this.projection().reach();
  }

  /**
   * Redraw `rect` from nothing: clear it once, then draw every place a tile reaches it, back to front, clipped to it.
   *  How tiles that overlap their neighbours, or draw past their boxes, are redrawn.
   */
  protected redrawRegion(rect: Rect): void {
    const context = this.context();

    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y, rect.width, rect.height);
    context.clip();

    this.#clip = rect;

    try {
      context.clearRect(rect.x, rect.y, rect.width, rect.height);

      this.markDirty(rect.x, rect.y, rect.width, rect.height);

      this.placementsOf(this.tilesIn(rect), rect).forEach((placement) =>
        this.paint(placement)
      );
    } finally {
      this.#clip = null;

      context.restore();
    }
  }

  /**
   * Redraw `tiles` where the projection's tiles overlap, or the layer draws past their boxes: each place one lands, out
   *  to the layer's reach, as one region with whatever else reaches it, so the neighbours a tile overlaps are drawn
   *  again, in order, over and under it.
   */
  protected redrawTiles(tiles: Tile[]): void {
    const regions: Rect[] = [];

    tiles.forEach(({ x, y }: Tile) =>
      this.placements(this.world().get(x, y)).forEach(([px, py]) => {
        const reach = this.#reachOf(px, py),
          // Whole pixels, so a region's edge is never half cleared.
          left = Math.max(0, Math.floor(reach.x)),
          top = Math.max(0, Math.floor(reach.y)),
          right = Math.min(
            this.#canvas.width,
            Math.ceil(reach.x + reach.width)
          ),
          bottom = Math.min(
            this.#canvas.height,
            Math.ceil(reach.y + reach.height)
          );

        if (right > left && bottom > top) {
          regions.push({
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
          });
        }
      })
    );

    // Disjoint, so no pixel is drawn twice.
    mergeRects(regions).forEach((region) => this.redrawRegion(region));
  }

  /** Redraw one region of the canvas, leaving the rest of it alone. */
  protected renderRegion(rect: Rect): void {
    if (this.#byRegion()) {
      this.redrawRegion(rect);

      return;
    }

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
    const { width, height } = this.projection().worldSize();

    this.#canvas.height = height;
    this.#canvas.width = width;
  }

  protected setOrigin(originX: number, originY: number): void {
    this.#originX = originX;
    this.#originY = originY;
  }

  /** The tiles that reach a region of this canvas. */
  protected tilesIn(rect: Rect): Tile[] {
    const span = this.projection().tileSpan(
        {
          x: this.#originX + rect.x,
          y: this.#originY + rect.y,
          width: rect.width,
          height: rect.height,
        },
        this.overhang()
      ),
      columns = wrapIndices(...span.columns, this.#world.width()),
      rows = wrapIndices(...span.rows, this.#world.height()),
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

  // Whether tiles are redrawn by region, each changed one cleared out to its reach and drawn again with everything that
  //  reaches it, rather than cleared and drawn in their own boxes: where the projection's tiles overlap their
  //  neighbours, and for a layer that draws past a tile's box, as clearing only the box would leave the rest behind,
  //  and clearing a neighbour's box would cut into it (#486).
  #byRegion(): boolean {
    if (this.projection().overlapsNeighbours()) {
      return true;
    }

    const { top, right, bottom, left } = this.reach();

    return top > 0 || right > 0 || bottom > 0 || left > 0;
  }

  // One square that can't be drawn mustn't stop the rest: a throw here used to abandon the layer mid-scroll, leaving it
  //  out of line with the others (#32).
  #draw(tile: Tile, offsetX: number, offsetY: number): void {
    try {
      this.drawTile(tile, offsetX, offsetY);
    } catch (error) {
      console.error(
        `${this.constructor.name} could not draw ${tile.x},${tile.y}.`,
        error
      );
    }
  }

  // The box of a tile placed at `px`, `py`, and as far past it as the layer draws.
  #reachOf(px: number, py: number): Rect {
    const { width, height } = this.projection().footprint(),
      reach = this.reach();

    return {
      x: px - reach.left,
      y: py - reach.top,
      width: width + reach.left + reach.right,
      height: height + reach.top + reach.bottom,
    };
  }
}

export default Map;
