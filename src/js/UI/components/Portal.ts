import { Coordinate, Tile, Unit } from '../types';
import { EventEmitter } from '@dom111/typed-event-emitter';
import Map from './Map';
import Transport from '../../Engine/Transport';
import World from './World';
import { s } from '@dom111/element';

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
  #layers: Map[] = [];
  #playerId: string | null = null;
  #scale: number;
  #tileSize: number;
  #transport: Transport;
  #world: World;

  constructor(
    world: World,
    transport: Transport,
    canvas: HTMLCanvasElement = s<HTMLCanvasElement>('<canvas></canvas>'),
    options: PortalOptions = {
      playerId: null,
      scale: 2,
    },
    ...layers: typeof Map[]
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
    this.#layers.forEach((layer: Map) => layer.update(updatedTiles));
  }

  canvas(): HTMLCanvasElement {
    return this.#canvas;
  }

  center(): Coordinate {
    return this.#center;
  }

  getLayer(LayerType: typeof Map): Map | null {
    return this.getLayers(LayerType).shift() ?? null;
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
    const tileSize = this.tileSize(),
      layerWidth = this.#world.width() * tileSize,
      centerX = this.#center.x * tileSize + Math.trunc(tileSize / this.scale()),
      portalCenterX = Math.trunc(this.#canvas.width / 2),
      layerHeight = this.#world.height() * tileSize,
      centerY = this.#center.y * tileSize + Math.trunc(tileSize / this.scale()),
      portalCenterY = Math.trunc(this.#canvas.height / 2);

    let startX = portalCenterX - centerX,
      endX = portalCenterX + layerWidth,
      startY = portalCenterY - centerY,
      endY = portalCenterY + layerHeight;

    while (startX > 0) {
      startX -= layerWidth;
    }

    while (startY > 0) {
      startY -= layerHeight;
    }

    while (endX < this.#canvas.width) {
      endX += layerWidth;
    }

    while (endY < this.#canvas.height) {
      endY += layerHeight;
    }

    this.#context.fillStyle = '#000';
    this.#context.fillRect(
      0,
      0,
      Math.max(this.#world.width() * tileSize, this.#canvas.width),
      Math.max(this.#world.height() * tileSize, this.#canvas.height)
    );

    for (let x = startX; x < endX; x += layerWidth) {
      for (let y = startY; y < endY; y += layerHeight) {
        this.#layers.forEach((layer) => {
          if (!layer.isVisible()) {
            return;
          }

          const canvas = layer.canvas();

          this.#context.drawImage(canvas, x, y, canvas.width, canvas.height);
        });
      }
    }
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
