import { Coordinate, Tile, Unit } from '@civ-clone/ui-protocol/types';
import { EventEmitter } from '@dom111/typed-event-emitter';
import {
  Rect,
  clampOrigin,
  isWithinView,
  mergeRects,
  rectArea,
} from '../lib/viewport';
import Map from './Map';
import { Projection, Size } from '../lib/projection';
import Transport from '@civ-clone/ui-client/Transport';
import World from './World';
import { s } from '@dom111/element';
import { IConstructor } from '@civ-clone/core-registry/Registry';
import currentTileset, {
  nativeTileSize,
} from '@civ-clone/ui-assets/lib/tilesets';
import projectionFor from '../lib/projectionFor';
import { City as CityData } from '@civ-clone/ui-protocol/types';

/** How a city opens from the map: which do, and opening one (`lib/cityOpeners.ts` has the game's). */
export type CityOpener = {
  // Whether `city` is one that opens: the map's click moves on to the square's units otherwise.
  opens(city: CityData, portal: Portal): boolean;
  open(city: CityData, portal: Portal): void;
};

export interface IPortal {
  build(updatedTiles: Tile[]): void;
  canvas(): HTMLCanvasElement;
  center(): Coordinate;
  getLayer(LayerType: typeof Map): Map | null;
  getLayers(LayerType: typeof Map): Map[];
  isVisible(x: number, y: number, margin?: number): boolean;
  lockVerticalEdges(): boolean;
  nativeTileSize(): Size;
  openCity(city: CityData): boolean;
  playerId(): string | null;
  render(): void;
  scale(): number;
  scrollBy(deltaX: number, deltaY: number): void;
  setCenter(x: number, y: number): void;
  setCovered(covered: Rect[]): void;
  setLockVerticalEdges(lock: boolean): void;
  setScale(scale: number): void;
  tileSize(): Size;
  transport(): Transport;
  visibleBounds(): [number, number, number, number];
  visibleRange(): [Coordinate, Coordinate];
  world(): World;
}

export interface PortalSettings {
  // How a city opens from here, and which do (`lib/cityOpeners.ts`): none, for a portal nothing opens from.
  cityOpener: CityOpener | null;
  lockVerticalEdges: boolean;
  playerId: string | null;
  scale: number;
  // The tileset's native tile, across and down, before the scale.
  tileSize: Size;
}

type PortalOptions = {
  [K in keyof PortalSettings]?: PortalSettings[K];
};

const defaultPortalOptions: PortalSettings = {
  cityOpener: null,
  lockVerticalEdges: false,
  playerId: null,
  scale: currentTileset().defaultScale,
  tileSize: nativeTileSize(currentTileset()),
};

// Past this share of the canvas, working out what changed and compositing it
// piece by piece costs more than compositing the lot.
const MAX_PARTIAL_COVERAGE = 0.5,
  // Likewise: a handful of regions is cheaper than the whole canvas, a hundred
  // of them is not.
  MAX_PARTIAL_REGIONS = 8,
  // Merging the rectangles is quadratic in how many there are, and a change
  // of government redraws every known square on every layer: thousands of
  // them, which only ever end in compositing the lot (#488). Past this many,
  // the whole canvas is cheaper without merging them first.
  MAX_PARTIAL_RECTS = 256;

export class Portal
  extends EventEmitter<{
    ['activate-unit']: [Unit];
    ['focus-changed']: [number, number];
    // Composited: what floats over the map in place of a layer (the unit's ring, #753) is placed again.
    ['rendered']: [];
    ['tile-clicked']: [number, number];
  }>
  implements IPortal
{
  #canvas: HTMLCanvasElement;
  #center: Coordinate = { x: 0, y: 0 };
  #cityOpener: CityOpener | null;
  #context: CanvasRenderingContext2D;
  // The parts of the canvas, in its px, that the interface floats over (the sidebar's sections, #697): a tile under
  //  one is in view but can't be seen.
  #covered: Rect[] = [];
  // Nothing has been composited yet, so the first render cannot be a partial
  // one however little the layers claim to have changed.
  #fullRender: boolean = true;
  // The layers that were hidden when the canvas was last composited (#488).
  #hiddenWhenComposited: Set<Map> = new Set();
  #layers: Map[] = [];
  // Whether the view stops at the top and bottom rows of the world rather
  // than wrapping over the poles.
  #lockVerticalEdges: boolean;
  // How far, in px, the view has been dragged off the centre tile's middle.
  // Kept inside that tile, as the projection says where its edges are, so
  // `#center` is always the tile under the middle of the canvas.
  #offset: Coordinate = { x: 0, y: 0 };
  #playerId: string | null = null;
  // Where tiles go on the world in pixels, at this portal's scale; made again
  // whenever the scale or the vertical wrap changes.
  #projection: Projection;
  #scale: number;
  #tileSize: Size;
  #transport: Transport;
  #viewport: Rect = { x: 0, y: 0, width: -1, height: -1 };
  #world: World;

  constructor(
    world: World,
    transport: Transport,
    canvas: HTMLCanvasElement = s<HTMLCanvasElement>('<canvas></canvas>'),
    options: PortalOptions = {
      playerId: null,
    },
    ...layers: (typeof Map)[]
  ) {
    const settings: PortalSettings = {
      ...defaultPortalOptions,
      ...options,
    };

    super();

    this.#world = world;
    this.#canvas = canvas;
    this.#cityOpener = settings.cityOpener;
    this.#lockVerticalEdges = settings.lockVerticalEdges;
    this.#playerId = settings.playerId;
    this.#tileSize = { ...settings.tileSize };
    this.#scale = settings.scale;
    this.#transport = transport;
    this.#projection = this.createProjection();

    layers.forEach((MapType) => {
      const layer = new MapType(this.#world, this.scale(), this.#tileSize);

      layer.setWrapVertical(!this.#lockVerticalEdges);

      this.#layers.push(layer);
    });

    this.#context = canvas.getContext('2d') as CanvasRenderingContext2D;

    this.bindEvents();
  }

  protected bindEvents(): void {}

  /**
   * Runs `action` on every layer, carrying on past one that throws: a layer left behind would otherwise leave every
   * layer after it out of line with the ones before (#32).
   */
  protected eachLayer(action: (layer: Map) => void): void {
    this.#layers.forEach((layer) => {
      try {
        action(layer);
      } catch (error) {
        console.error(`${layer.constructor.name} failed to update.`, error);
      }
    });
  }

  build(updatedTiles: Tile[]): void {
    this.syncViewport();

    this.eachLayer((layer) => layer.update(updatedTiles));
  }

  canvas(): HTMLCanvasElement {
    return this.#canvas;
  }

  center(): Coordinate {
    return this.#center;
  }

  getLayer<T extends Map>(LayerType: IConstructor<T>): T | null {
    return (this.getLayers(LayerType).shift() as T) ?? null;
  }

  getLayers(LayerType: typeof Map): Map[] {
    return this.#layers.filter((layer) => layer instanceof LayerType);
  }

  /**
   * Whether the tile at `x`, `y` is in view — and, given a `margin`, at least
   * that many tiles in from the edge of it, which is what recentring on a unit
   * wants: one on the very edge is technically visible but hard to see.
   *
   * Counted in the projection's steps, columns across and rows down, so on a staggered grid twice as many rows fit as
   *  boxes would, and a tile on a shifted row is half a column further along than its column says.
   *
   * Approximate: whole steps from the centre tile, with the drag offset ignored. On the square grid that only says a
   *  tile up to half a column inside the edge is hidden; on a staggered grid a margin-0 answer can be off by up to
   *  half a column either way (docs/known-issues-and-rewrite-notes.md).
   */
  isVisible(x: number, y: number, margin: number = 0): boolean {
    const projection = this.#projection,
      step = projection.tileStep(),
      [tileX, tileY] = projection.tileToPixel(x, y),
      [centerX, centerY] = projection.tileToPixel(
        this.#center.x,
        this.#center.y
      );

    return (
      isWithinView(
        (tileX - centerX) / step.x,
        0,
        Math.floor(this.#canvas.width / step.x),
        this.#world.width(),
        margin
      ) &&
      (isWithinView(
        (tileY - centerY) / step.y,
        0,
        Math.floor(this.#canvas.height / step.y),
        this.#world.height(),
        margin
      ) ||
        // Near a locked edge the view cannot get any closer to centring the
        // tile than it already is, and asking it to would recentre forever.
        // Moved only up or down, from where it is across, as a staggered
        // grid's centre depends on where across the middle is too.
        (this.#lockVerticalEdges &&
          this.#centredAlready(
            this.#middleOf(x, y)[1] -
              this.#middleOf(this.#center.x, this.#center.y)[1]
          ))) &&
      !this.#isCovered(x, y, margin)
    );
  }

  /** Whether the view, moved `down` px to centre on a row, would stop at the pole where it is. */
  #centredAlready(down: number): boolean {
    const [center] = this.clampedCenter(this.#center, {
      x: this.#offset.x,
      y: down,
    });

    return center.x === this.#center.x && center.y === this.#center.y;
  }

  /**
   * Whether the tile at `x`, `y` is under a part of the interface floating over the canvas, or within `margin` tiles of
   *  one: in view, but hidden. Its sprite box on the canvas (the copy nearest the middle, on a wrapping world) against
   *  each covered area, so it holds for any projection. Only where the view is smaller than the world, so each tile is
   *  shown once, and never when the middle of the canvas is covered too, where recentring couldn't help.
   */
  #isCovered(x: number, y: number, margin: number): boolean {
    if (this.#covered.length === 0) {
      return false;
    }

    const { width, height } = this.#projection.footprint(),
      step = this.#projection.tileStep(),
      canvasWidth = this.#canvas.width,
      canvasHeight = this.#canvas.height;

    // A view as big as the world shows each tile more than once, so one copy under the interface leaves another in
    //  sight.
    if (
      Math.floor(canvasWidth / step.x) >= this.#world.width() ||
      Math.floor(canvasHeight / step.y) >= this.#world.height()
    ) {
      return false;
    }

    // `margin` tiles is that many columns across and rows down.
    const reachX = Math.max(0, margin) * step.x,
      reachY = Math.max(0, margin) * step.y,
      areas = this.#covered.map((rect) => ({
        left: rect.x - reachX,
        top: rect.y - reachY,
        right: rect.x + rect.width + reachX,
        bottom: rect.y + rect.height + reachY,
      })),
      middleX = canvasWidth / 2,
      middleY = canvasHeight / 2;

    if (
      areas.some(
        ({ left, top, right, bottom }) =>
          middleX >= left &&
          middleX < right &&
          middleY >= top &&
          middleY < bottom
      )
    ) {
      return false;
    }

    this.syncViewport();

    const [pixelX, pixelY] = this.#projection.tileToPixel(x, y),
      period = this.#projection.wrapPeriod(),
      // The copy of the tile nearest the middle of the canvas.
      nearest = (
        position: number,
        size: number,
        middle: number,
        span: number | null
      ) =>
        span === null
          ? position
          : position +
            Math.round((middle - (position + size / 2)) / span) * span,
      left = nearest(pixelX - this.#viewport.x, width, middleX, period.x),
      top = nearest(pixelY - this.#viewport.y, height, middleY, period.y),
      right = left + width,
      bottom = top + height;

    return areas.some(
      (area) =>
        left < area.right &&
        right > area.left &&
        top < area.bottom &&
        bottom > area.top
    );
  }

  lockVerticalEdges(): boolean {
    return this.#lockVerticalEdges;
  }

  /**
   * Opens `city`'s screen the way this portal's game opens one, from the map, a report or a notice alike, and says
   * whether it did: a player's own city opens, a watcher's any city of a civilisation watched (#613), and nothing
   * opens from a portal given no opener.
   */
  openCity(city: CityData): boolean {
    if (this.#cityOpener === null || !this.#cityOpener.opens(city, this)) {
      return false;
    }

    this.#cityOpener.open(city, this);

    return true;
  }

  playerId(): string | null {
    return this.#playerId;
  }

  render(): void {
    this.syncViewport();

    // Every layer is a window on the world the same size and shape as this
    // canvas now, so compositing one is a straight copy — and copying only the
    // parts that changed is all that a blinking unit or a moved one needs.
    const regions = this.#fullRender
      ? [{ x: 0, y: 0, width: this.#canvas.width, height: this.#canvas.height }]
      : this.dirtyRegions();

    this.#layers.forEach((layer) => layer.clearDirty());

    this.#hiddenWhenComposited = new Set(
      this.#layers.filter((layer) => !layer.isVisible())
    );

    this.#fullRender = false;

    regions.forEach(({ x, y, width, height }: Rect) => {
      // A portal whose element has no size yet has nothing to composite, and
      // `drawImage` throws on a zero-sized rectangle.
      if (width <= 0 || height <= 0) {
        return;
      }

      this.#context.fillStyle = '#000';
      this.#context.fillRect(x, y, width, height);

      this.#layers.forEach((layer) => {
        if (!layer.composited() || !layer.isVisible()) {
          return;
        }

        this.#context.drawImage(
          layer.canvas(),
          x,
          y,
          width,
          height,
          x,
          y,
          width,
          height
        );
      });
    });

    this.emit('rendered');
  }

  /**
   * The centre tile and offset the view would have if it centred on `center`, `offset` px from its middle, once kept
   *  from running past the top or bottom of the world: the pixel at the canvas's middle is moved up or down until the
   *  view stops at the pole, and the tile under it is the centre. On a staggered grid that can be the tile beside the
   *  one above or below, so the column can change as well as the row. The row is not wrapped.
   */
  protected clampedCenter(
    center: Coordinate,
    offset: Coordinate
  ): [Coordinate, Coordinate] {
    const projection = this.#projection,
      canvasHalf = Math.trunc(this.#canvas.height / 2),
      [middleX, middleY] = this.#middleOf(center.x, center.y),
      clamped =
        clampOrigin(
          middleY + offset.y - canvasHalf,
          this.#canvas.height,
          projection.worldSize().height
        ) + canvasHalf,
      [column, row] = projection.pixelToTile(middleX + offset.x, clamped),
      [columnX, rowY] = this.#middleOf(column, row),
      worldWidth = this.#world.width();

    return [
      { x: ((column % worldWidth) + worldWidth) % worldWidth, y: row },
      { x: offset.x - (columnX - middleX), y: clamped - rowY },
    ];
  }

  /**
   * The middle of the tile at `x`, `y`, in world px, as the portal centres it: the middle of its sprite box, with the
   *  box's corner rounded to a whole pixel first. A tile's pixel need not be whole (an odd-sized tile's shifted row is
   *  half a pixel along), and the canvas is drawn at whole pixels, so the middle is one too: the offset a drag leaves
   *  is then all that rounds, and only a fraction of a pixel of drag can put the centre a pixel off the tile drawn
   *  under the canvas's middle, as on the square grid, whose pixels are all whole.
   */
  #middleOf(x: number, y: number): [number, number] {
    const projection = this.#projection,
      { width, height } = projection.footprint(),
      [left, top] = projection.tileToPixel(x, y);

    return [
      Math.round(left) + Math.trunc(width / 2),
      Math.round(top) + Math.trunc(height / 2),
    ];
  }

  /**
   * The tile under the canvas's middle, when that is `offset` px from `center`'s middle, and how far it is from that
   *  tile's middle: the tile is the projection's, so a drag on a staggered grid crosses into the diamond beside as
   *  well as the one below. Neither is wrapped.
   */
  #retarget(
    center: Coordinate,
    offset: Coordinate
  ): [[number, number], Coordinate] {
    const [middleX, middleY] = this.#middleOf(center.x, center.y),
      tile = this.#projection.pixelToTile(
        middleX + offset.x,
        middleY + offset.y
      ),
      [tileX, tileY] = this.#middleOf(...tile);

    // The difference of two tiles' middles, taken off the offset, rather than the offset worked out again from the
    //  pixel: both are whole pixels, so a slow drag's fractions add up exactly, as before.
    return [
      tile,
      { x: offset.x - (tileX - middleX), y: offset.y - (tileY - middleY) },
    ];
  }

  /**
   * Where tiles go on the world in pixels, at this portal's scale and wrap: the current tileset's projection. Made
   *  again whenever the scale or the vertical wrap changes, and first from the constructor, before a subclass's own
   *  fields are set.
   */
  protected createProjection(): Projection {
    return projectionFor(
      currentTileset(),
      this.#world,
      this.tileSize(),
      !this.#lockVerticalEdges
    );
  }

  /**
   * What the layers have changed since the last composite, as disjoint
   * rectangles — or the whole canvas, when there is enough of it that finding
   * out was the only saving left.
   */
  protected dirtyRegions(): Rect[] {
    const canvasArea = this.#canvas.width * this.#canvas.height,
      whole = [
        { x: 0, y: 0, width: this.#canvas.width, height: this.#canvas.height },
      ],
      // A layer hidden since the last composite still counts: the pixels it
      // contributed then have to be composited over by the layers below it. One
      // that was hidden then and is hidden now has nothing on the canvas, so
      // what it redraws while hidden, such as the yields on every square after
      // a change of government, changes nothing there (#488).
      dirty = this.#layers
        .filter(
          (layer) =>
            layer.composited() &&
            (layer.isVisible() || !this.#hiddenWhenComposited.has(layer))
        )
        .flatMap((layer) => layer.dirtyRects());

    if (dirty.length === 0) {
      return [];
    }

    // Before merging them, which is quadratic: so many rectangles only ever
    // ends in compositing the lot, and so does one that covers more than the
    // share allowed, as what it merges into is at least as big (#488).
    if (
      dirty.length > MAX_PARTIAL_RECTS ||
      dirty.some((rect) => rectArea(rect) > canvasArea * MAX_PARTIAL_COVERAGE)
    ) {
      return whole;
    }

    const regions = mergeRects(dirty);

    if (regions.length > MAX_PARTIAL_REGIONS) {
      return whole;
    }

    return regions.reduce((total, rect) => total + rectArea(rect), 0) >
      canvasArea * MAX_PARTIAL_COVERAGE
      ? whole
      : regions;
  }

  /**
   * Point every layer at the window this portal is showing, so each of them
   * holds the viewport rather than the world.
   */
  protected syncViewport(): void {
    if (this.#lockVerticalEdges) {
      // Here rather than where the centre is set, so a resize that would
      // uncover a pole is caught too.
      // In place: `center()` hands out this object.
      const [center, offset] = this.clampedCenter(this.#center, this.#offset);

      Object.assign(this.#center, center);
      Object.assign(this.#offset, offset);
    }

    const [middleX, middleY] = this.#middleOf(this.#center.x, this.#center.y),
      // Where the world pixel at the canvas's top left corner is: the centre tile's middle, as far off it as the
      //  view has been dragged, half the canvas up and left. The drag offset is rounded here rather than where it is
      //  kept, so a slow drag still adds up, while the layers only ever scroll by whole pixels and never smear.
      originX =
        middleX +
        Math.round(this.#offset.x) -
        Math.trunc(this.#canvas.width / 2),
      originY =
        middleY +
        Math.round(this.#offset.y) -
        Math.trunc(this.#canvas.height / 2);

    if (
      originX === this.#viewport.x &&
      originY === this.#viewport.y &&
      this.#canvas.width === this.#viewport.width &&
      this.#canvas.height === this.#viewport.height
    ) {
      return;
    }

    this.#viewport = {
      x: originX,
      y: originY,
      width: this.#canvas.width,
      height: this.#canvas.height,
    };

    this.eachLayer((layer) =>
      layer.setViewport(
        originX,
        originY,
        this.#canvas.width,
        this.#canvas.height
      )
    );

    // The window moved, so everything on it is new.
    this.#fullRender = true;
  }

  scale(): number {
    return this.#scale;
  }

  /**
   * Move the view by `deltaX`, `deltaY` px, as a drag does: the centre follows
   * whichever tile ends up under the middle of the canvas.
   */
  scrollBy(deltaX: number, deltaY: number): void {
    const [[column, row], offset] = this.#retarget(this.#center, {
      x: this.#offset.x + deltaX,
      y: this.#offset.y + deltaY,
    });

    Object.assign(this.#offset, offset);

    if (column === this.#center.x && row === this.#center.y) {
      this.render();

      return;
    }

    const width = this.#world.width(),
      height = this.#world.height();

    this.#center.x = ((column % width) + width) % width;
    // Locked to the poles, the row is left for the clamp in `syncViewport`
    // to stop at the edge: wrapping it first would carry a drag that runs past
    // one pole to the other.
    this.#center.y = this.#lockVerticalEdges
      ? row
      : ((row % height) + height) % height;

    this.render();

    this.emit('focus-changed', this.#center.x, this.#center.y);
  }

  setLockVerticalEdges(lock: boolean): void {
    if (lock === this.#lockVerticalEdges) {
      return;
    }

    this.#lockVerticalEdges = lock;
    this.#projection = this.createProjection();

    // The layers have the far pole drawn beyond each edge, or not, so all of
    // them have to be redrawn either way.
    this.#layers.forEach((layer) => layer.setWrapVertical(!lock));

    this.#viewport = { x: 0, y: 0, width: -1, height: -1 };

    this.render();

    this.emit('focus-changed', this.#center.x, this.#center.y);
  }

  /**
   * Draw the map at `scale` from now on, keeping the same tile in the middle.
   */
  setScale(scale: number): void {
    if (scale === this.#scale) {
      return;
    }

    this.#scale = scale;
    this.#projection = this.createProjection();
    this.#offset.x = 0;
    this.#offset.y = 0;

    this.#layers.forEach((layer) => layer.setScale(scale));

    // Nothing on the layers is at the new scale, so this has to reach them
    // even if the arithmetic happened to land on the same origin.
    this.#viewport = { x: 0, y: 0, width: -1, height: -1 };

    this.render();

    this.emit('focus-changed', this.#center.x, this.#center.y);
  }

  /** The parts of the canvas, in its px, that the interface floats over, which `isVisible` counts as out of view. */
  setCovered(covered: Rect[]): void {
    this.#covered = covered;
  }

  setCenter(x: number, y: number): void {
    this.#center.x = x;
    this.#center.y = y;
    this.#offset.x = 0;
    this.#offset.y = 0;

    this.render();

    this.emit('focus-changed', x, y);
  }

  /** The city a layer draws something for under the canvas pixel at `x`, `y`, past its own square (#747). */
  cityAt(x: number, y: number): CityData | null {
    this.syncViewport();

    for (const layer of this.#layers) {
      const city = layer.isVisible() ? layer.cityAt(x, y) : null;

      if (city !== null) {
        return city;
      }
    }

    return null;
  }

  /** As `cityAt`, with the box on the canvas the layer draws it in. */
  bannerAt(x: number, y: number): { city: CityData; box: Rect } | null {
    this.syncViewport();

    for (const layer of this.#layers) {
      const banner = layer.isVisible() ? layer.bannerAt(x, y) : null;

      if (banner !== null) {
        return banner;
      }
    }

    return null;
  }

  /**
   * The tile under the canvas pixel at `x`, `y` — or `null` past a locked
   * pole, where the canvas is empty and there is no tile to point at.
   */
  tileAt(x: number, y: number): Tile | null {
    return this.squareAt(x, y)?.tile ?? null;
  }

  /** As `tileAt`, with the box on the canvas the square is drawn in, that a tooltip about it opens over (#748). */
  squareAt(x: number, y: number): { tile: Tile; box: Rect } | null {
    this.syncViewport();

    const [column, row] = this.#projection.pixelToTile(
      this.#viewport.x + x,
      this.#viewport.y + y
    );

    if (this.#lockVerticalEdges && (row < 0 || row >= this.#world.height())) {
      return null;
    }

    // The copy of the square under the pixel, not wrapped, so the box is where the pointer is.
    const [left, top] = this.#projection.tileToPixel(column, row),
      { width, height } = this.#projection.footprint();

    return {
      tile: this.#world.get(column, row),
      box: {
        x: left - this.#viewport.x,
        y: top - this.#viewport.y,
        width,
        height,
      },
    };
  }

  /** The box on the canvas the square at `x`, `y` is drawn in: what `squareAt` gives for a pixel inside it. */
  boxOf({ x, y }: Coordinate): Rect {
    this.syncViewport();

    const [left, top] = this.#projection.tileToPixel(x, y),
      { width, height } = this.#projection.footprint();

    return {
      x: left - this.#viewport.x,
      y: top - this.#viewport.y,
      width,
      height,
    };
  }

  /** Where tiles go on the world in pixels, at this portal's scale. */
  projection(): Projection {
    return this.#projection;
  }

  /** One tile on screen, across and down: the native tile at this portal's scale. */
  tileSize(): Size {
    return {
      width: this.#tileSize.width * this.#scale,
      height: this.#tileSize.height * this.#scale,
    };
  }

  /** The native tile, across and down, as the portal was given it: `tileSize()` before the scale. */
  nativeTileSize(): Size {
    return { ...this.#tileSize };
  }

  transport(): Transport {
    return this.#transport;
  }

  visibleBounds(): [number, number, number, number] {
    const [
      { x: xLowerBound, y: yLowerBound },
      { x: xUpperBound, y: yUpperBound },
    ] = this.visibleRange();

    return [xLowerBound, xUpperBound, yLowerBound, yUpperBound];
  }

  visibleRange(): [Coordinate, Coordinate] {
    const step = this.#projection.tileStep(),
      tileRangeX = Math.floor(Math.floor(this.#canvas.width / step.x) / 2),
      tileRangeY = Math.floor(Math.floor(this.#canvas.height / step.y) / 2);

    return [
      {
        x:
          (this.#center.x - tileRangeX + this.#world.width()) %
          this.#world.width(),
        y:
          (this.#center.y - tileRangeY + this.#world.height()) %
          this.#world.height(),
      },
      {
        x: (this.#center.x + tileRangeX) % this.#world.width(),
        y: (this.#center.y + tileRangeY) % this.#world.height(),
      },
    ];
  }

  rawVisibleRange(): [Coordinate, Coordinate] {
    const step = this.#projection.tileStep(),
      tileRangeX = Math.floor(Math.floor(this.#canvas.width / step.x) / 2),
      tileRangeY = Math.floor(Math.floor(this.#canvas.height / step.y) / 2);

    return [
      {
        x: this.#center.x - tileRangeX,
        y: this.#center.y - tileRangeY,
      },
      {
        x: this.#center.x + tileRangeX,
        y: this.#center.y + tileRangeY,
      },
    ];
  }

  world(): World {
    return this.#world;
  }
}

export default Portal;
