import { Coordinate, Tile, Unit } from '../types';
import { EventEmitter } from '@dom111/typed-event-emitter';
import { Rect, isWithinView, mergeRects, rectArea } from '../lib/viewport';
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
  playerId(): string | null;
  render(): void;
  scale(): number;
  scrollBy(deltaX: number, deltaY: number): void;
  setCenter(x: number, y: number): void;
  tileSize(): number;
  transport(): Transport;
  visibleBounds(): [number, number, number, number];
  visibleRange(): [Coordinate, Coordinate];
  world(): World;
}

export interface PortalSettings {
  playerId: string | null;
  scale: number;
  tileSize: number;
}

type PortalOptions = {
  [K in keyof PortalSettings]?: PortalSettings[K];
};

const defaultPortalOptions: PortalSettings = {
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
    this.#playerId = settings.playerId;
    this.#tileSize = settings.tileSize;
    this.#scale = settings.scale;
    this.#transport = transport;

    layers.forEach((MapType) =>
      this.#layers.push(new MapType(this.#world, this.scale(), this.#tileSize))
    );

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
      isWithinView(
        y,
        this.#center.y,
        Math.floor(this.#canvas.height / this.tileSize()),
        this.#world.height(),
        margin
      )
    );
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
    const tileSize = this.tileSize(),
      // Where the world pixel at the canvas's top left corner is. The half-tile
      // step is what centres the middle tile rather than its corner.
      // The drag offset is rounded here rather than where it is kept, so a
      // slow drag still adds up, while the layers only ever scroll by whole
      // pixels and never smear.
      originX =
        this.#center.x * tileSize +
        Math.round(this.#offset.x) +
        Math.trunc(tileSize / this.scale()) -
        Math.trunc(this.#canvas.width / 2),
      originY =
        this.#center.y * tileSize +
        Math.round(this.#offset.y) +
        Math.trunc(tileSize / this.scale()) -
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
    this.#center.y = (((this.#center.y + stepY) % height) + height) % height;

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

  /** The tile under the canvas pixel at `x`, `y`. */
  tileAt(x: number, y: number): Tile {
    this.syncViewport();

    const tileSize = this.tileSize();

    return this.#world.get(
      Math.floor((this.#viewport.x + x) / tileSize),
      Math.floor((this.#viewport.y + y) / tileSize)
    );
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
