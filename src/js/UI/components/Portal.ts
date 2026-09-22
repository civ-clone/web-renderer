import { Coordinate, Tile, Unit } from '../types';
import { EventEmitter } from '@dom111/typed-event-emitter';
import { Rect, mergeRects, rectArea } from '../lib/viewport';
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
  isVisible(x: number, y: number): boolean;
  playerId(): string | null;
  render(): void;
  scale(): number;
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

  isVisible(x: number, y: number): boolean {
    const visibleHorizontal = Math.floor(this.#canvas.width / this.tileSize()),
      visibleVertical = Math.floor(this.#canvas.height / this.tileSize());

    if (
      visibleHorizontal >= this.#world.width() &&
      visibleVertical >= this.#world.height()
    ) {
      return true;
    }

    const [xLowerBound, xUpperBound, yLowerBound, yUpperBound] =
      this.visibleBounds();

    // I _think_ this logic is correct now...
    return (
      (visibleHorizontal >= this.#world.width() ||
        (xLowerBound > xUpperBound
          ? x < xUpperBound || x > xLowerBound
          : x < xUpperBound && x > xLowerBound)) &&
      (visibleVertical >= this.#world.height() ||
        (yLowerBound > yUpperBound
          ? y < yUpperBound || y > yLowerBound
          : y < yUpperBound && y > yLowerBound))
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
      originX =
        this.#center.x * tileSize +
        Math.trunc(tileSize / this.scale()) -
        Math.trunc(this.#canvas.width / 2),
      originY =
        this.#center.y * tileSize +
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

  setCenter(x: number, y: number): void {
    this.#center.x = x;
    this.#center.y = y;

    this.render();

    this.emit('focus-changed', x, y);
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
