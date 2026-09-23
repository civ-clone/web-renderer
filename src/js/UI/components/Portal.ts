import { Coordinate, Tile, Unit } from '../types';
import { EventEmitter } from '@dom111/typed-event-emitter';
import {
  Rect,
  clampOrigin,
  isWithinView,
  mergeRects,
  rectArea,
} from '../lib/viewport';
import Map from './Map';
import Transport from '../Transport';
import World from './World';
import { s } from '@dom111/element';
import { IConstructor } from '@civ-clone/core-registry/Registry';

export interface IPortal {
  build(updatedTiles: Tile[]): void;
  canvas(): HTMLCanvasElement;
  center(): Coordinate;
  getLayer(LayerType: typeof Map): Map | null;
  getLayers(LayerType: typeof Map): Map[];
  isVisible(x: number, y: number, margin?: number): boolean;
  lockVerticalEdges(): boolean;
  playerId(): string | null;
  render(): void;
  scale(): number;
  scrollBy(deltaX: number, deltaY: number): void;
  setCenter(x: number, y: number): void;
  setLockVerticalEdges(lock: boolean): void;
  setScale(scale: number): void;
  tileSize(): number;
  transport(): Transport;
  visibleBounds(): [number, number, number, number];
  visibleRange(): [Coordinate, Coordinate];
  world(): World;
}

export interface PortalSettings {
  lockVerticalEdges: boolean;
  playerId: string | null;
  scale: number;
  tileSize: number;
}

type PortalOptions = {
  [K in keyof PortalSettings]?: PortalSettings[K];
};

const defaultPortalOptions: PortalSettings = {
  lockVerticalEdges: false,
  playerId: null,
  scale: 2,
  tileSize: 16,
};

// Past this share of the canvas, working out what changed and compositing it
// piece by piece costs more than compositing the lot.
const MAX_PARTIAL_COVERAGE = 0.5,
  // Likewise: a handful of regions is cheaper than the whole canvas, a hundred
  // of them is not.
  MAX_PARTIAL_REGIONS = 8;

export class Portal
  extends EventEmitter<{
    ['activate-unit']: [Unit];
    ['focus-changed']: [number, number];
  }>
  implements IPortal
{
  #canvas: HTMLCanvasElement;
  #center: Coordinate = { x: 0, y: 0 };
  #context: CanvasRenderingContext2D;
  // Nothing has been composited yet, so the first render cannot be a partial
  // one however little the layers claim to have changed.
  #fullRender: boolean = true;
  #layers: Map[] = [];
  // Whether the view stops at the top and bottom rows of the world rather
  // than wrapping over the poles.
  #lockVerticalEdges: boolean;
  // How far, in px, the view has been dragged off the centre tile. Kept within
  // half a tile of it, so `#center` is always the tile under the middle of the
  // canvas.
  #offset: Coordinate = { x: 0, y: 0 };
  #playerId: string | null = null;
  #scale: number;
  #tileSize: number;
  #transport: Transport;
  #viewport: Rect = { x: 0, y: 0, width: -1, height: -1 };
  #world: World;

  constructor(
    world: World,
    transport: Transport,
    canvas: HTMLCanvasElement = s<HTMLCanvasElement>('<canvas></canvas>'),
    options: PortalOptions = {
      playerId: null,
      scale: 2,
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
    this.#lockVerticalEdges = settings.lockVerticalEdges;
    this.#playerId = settings.playerId;
    this.#tileSize = settings.tileSize;
    this.#scale = settings.scale;
    this.#transport = transport;

    layers.forEach((MapType) => {
      const layer = new MapType(this.#world, this.scale(), this.#tileSize);

      layer.setWrapVertical(!this.#lockVerticalEdges);

      this.#layers.push(layer);
    });

    this.#context = canvas.getContext('2d') as CanvasRenderingContext2D;

    this.bindEvents();
  }

  protected bindEvents(): void {}

  build(updatedTiles: Tile[]): void {
    this.syncViewport();

    this.#layers.forEach((layer: Map) => layer.update(updatedTiles));
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
   */
  isVisible(x: number, y: number, margin: number = 0): boolean {
    return (
      isWithinView(
        x,
        this.#center.x,
        Math.floor(this.#canvas.width / this.tileSize()),
        this.#world.width(),
        margin
      ) &&
      (isWithinView(
        y,
        this.#center.y,
        Math.floor(this.#canvas.height / this.tileSize()),
        this.#world.height(),
        margin
      ) ||
        // Near a locked edge the view cannot get any closer to centring the
        // tile than it already is, and asking it to would recentre forever.
        (this.#lockVerticalEdges &&
          this.clampedCenterY(y, 0)[0] === this.#center.y))
    );
  }

  lockVerticalEdges(): boolean {
    return this.#lockVerticalEdges;
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
  }

  /**
   * The centre row and offset the view would have if it centred on row `y`
   * `offset` px down from its middle, once kept from running past the top or
   * bottom of the world.
   */
  protected clampedCenterY(y: number, offset: number): [number, number] {
    const tileSize = this.tileSize(),
      half = Math.trunc(tileSize / 2),
      canvasHalf = Math.trunc(this.#canvas.height / 2),
      middle = y * tileSize + half + offset,
      clamped =
        clampOrigin(
          middle - canvasHalf,
          this.#canvas.height,
          this.#world.height() * tileSize
        ) + canvasHalf,
      row = Math.round((clamped - half) / tileSize);

    return [row, clamped - half - row * tileSize];
  }

  /**
   * What the layers have changed since the last composite, as disjoint
   * rectangles — or the whole canvas, when there is enough of it that finding
   * out was the only saving left.
   */
  protected dirtyRegions(): Rect[] {
    const whole = [
        { x: 0, y: 0, width: this.#canvas.width, height: this.#canvas.height },
      ],
      // A hidden layer still reports what it changed: it is hidden by being
      // left out of the composite, and the pixels it used to contribute have to
      // be composited over by the layers below it.
      dirty = this.#layers
        .filter((layer) => layer.composited())
        .flatMap((layer) => layer.dirtyRects());

    if (dirty.length === 0) {
      return [];
    }

    const regions = mergeRects(dirty);

    if (regions.length > MAX_PARTIAL_REGIONS) {
      return whole;
    }

    return regions.reduce((total, rect) => total + rectArea(rect), 0) >
      this.#canvas.width * this.#canvas.height * MAX_PARTIAL_COVERAGE
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
      [this.#center.y, this.#offset.y] = this.clampedCenterY(
        this.#center.y,
        this.#offset.y
      );
    }

    const tileSize = this.tileSize(),
      // Where the world pixel at the canvas's top left corner is. The half-tile
      // step is what centres the middle tile rather than its corner; it was
      // `tileSize / scale`, which is half a tile only at a scale of 2.
      // The drag offset is rounded here rather than where it is kept, so a
      // slow drag still adds up, while the layers only ever scroll by whole
      // pixels and never smear.
      originX =
        this.#center.x * tileSize +
        Math.round(this.#offset.x) +
        Math.trunc(tileSize / 2) -
        Math.trunc(this.#canvas.width / 2),
      originY =
        this.#center.y * tileSize +
        Math.round(this.#offset.y) +
        Math.trunc(tileSize / 2) -
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

    this.#layers.forEach((layer) =>
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
    const tileSize = this.tileSize(),
      offsetX = this.#offset.x + deltaX,
      offsetY = this.#offset.y + deltaY,
      stepX = Math.round(offsetX / tileSize),
      stepY = Math.round(offsetY / tileSize);

    this.#offset.x = offsetX - stepX * tileSize;
    this.#offset.y = offsetY - stepY * tileSize;

    if (stepX === 0 && stepY === 0) {
      this.render();

      return;
    }

    const width = this.#world.width(),
      height = this.#world.height();

    this.#center.x = (((this.#center.x + stepX) % width) + width) % width;
    // Locked to the poles, the row is left for the clamp in `syncViewport`
    // to stop at the edge: wrapping it first would carry a drag that runs past
    // one pole to the other.
    this.#center.y = this.#lockVerticalEdges
      ? this.#center.y + stepY
      : (((this.#center.y + stepY) % height) + height) % height;

    this.render();

    this.emit('focus-changed', this.#center.x, this.#center.y);
  }

  setLockVerticalEdges(lock: boolean): void {
    if (lock === this.#lockVerticalEdges) {
      return;
    }

    this.#lockVerticalEdges = lock;

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
    this.#offset.x = 0;
    this.#offset.y = 0;

    this.#layers.forEach((layer) => layer.setScale(scale));

    // Nothing on the layers is at the new scale, so this has to reach them
    // even if the arithmetic happened to land on the same origin.
    this.#viewport = { x: 0, y: 0, width: -1, height: -1 };

    this.render();

    this.emit('focus-changed', this.#center.x, this.#center.y);
  }

  setCenter(x: number, y: number): void {
    this.#center.x = x;
    this.#center.y = y;
    this.#offset.x = 0;
    this.#offset.y = 0;

    this.render();

    this.emit('focus-changed', x, y);
  }

  /**
   * The tile under the canvas pixel at `x`, `y` — or `null` past a locked
   * pole, where the canvas is empty and there is no tile to point at.
   */
  tileAt(x: number, y: number): Tile | null {
    this.syncViewport();

    const tileSize = this.tileSize(),
      row = Math.floor((this.#viewport.y + y) / tileSize);

    if (this.#lockVerticalEdges && (row < 0 || row >= this.#world.height())) {
      return null;
    }

    return this.#world.get(Math.floor((this.#viewport.x + x) / tileSize), row);
  }

  tileSize(): number {
    return this.#tileSize * this.#scale;
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
    const tileRangeX = Math.floor(
        Math.floor(this.#canvas.width / this.tileSize()) / 2
      ),
      tileRangeY = Math.floor(
        Math.floor(this.#canvas.height / this.tileSize()) / 2
      );

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
    const tileRangeX = Math.floor(
        Math.floor(this.#canvas.width / this.tileSize()) / 2
      ),
      tileRangeY = Math.floor(
        Math.floor(this.#canvas.height / this.tileSize()) / 2
      );

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
