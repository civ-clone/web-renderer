import { Coordinate, Tile, Unit } from '../types';
import { EventEmitter } from 'eventemitter3';
import Map from './Map';
import World from './World';
import { e } from '../lib/html';

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
  #world: World;

  constructor(
    world: World,
    canvas: HTMLCanvasElement = e('canvas') as HTMLCanvasElement,
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

    layers.forEach((MapType) =>
      this.#layers.push(new MapType(this.#world, this.scale(), this.tileSize()))
    );

    this.#context = canvas.getContext('2d') as CanvasRenderingContext2D;

    this.bindEvents();
  }

  protected bindEvents(): void {}

  public build(updatedTiles: Tile[]): void {
    this.#layers.forEach((layer: Map) => layer.update(updatedTiles));
  }

  public canvas(): HTMLCanvasElement {
    return this.#canvas;
  }

  public center(): Coordinate {
    return this.#center;
  }

  public getLayer(LayerType: typeof Map): Map | null {
    return this.getLayers(LayerType).shift() ?? null;
  }

  public getLayers(LayerType: typeof Map): Map[] {
    return this.#layers.filter((layer) => layer instanceof LayerType);
  }

  public isVisible(x: number, y: number): boolean {
    const visibleHorizontal = Math.floor(this.#canvas.width / this.#tileSize),
      visibleVertical = Math.floor(this.#canvas.height / this.#tileSize);

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

  public playerId(): string | null {
    return this.#playerId;
  }

  public render(): void {
    const tileSize = this.#layers[0].tileSize(),
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

  public scale(): number {
    return this.#scale;
  }

  public setCenter(x: number, y: number): void {
    this.#center.x = x;
    this.#center.y = y;

    this.render();

    this.emit('focus-changed', x, y);
  }

  public tileSize(): number {
    return this.#tileSize;
  }

  public visibleBounds(): [number, number, number, number] {
    const xRange = Math.floor(
        this.#canvas.width / this.#layers[0].tileSize() / this.#scale
      ),
      yRange = Math.floor(
        this.#canvas.height / this.#layers[0].tileSize() / this.#scale
      ),
      xLowerBound =
        (this.#center.x - xRange + this.#world.width()) % this.#world.width(),
      xUpperBound = (this.#center.x + xRange) % this.#world.width(),
      yLowerBound =
        (this.#center.y - yRange + this.#world.height()) % this.#world.height(),
      yUpperBound = (this.#center.y + yRange) % this.#world.height();

    return [xLowerBound, xUpperBound, yLowerBound, yUpperBound];
  }

  public visibleRange(): [Coordinate, Coordinate] {
    const xRange = Math.floor(
        this.#canvas.width / this.#layers[0].tileSize() / this.#scale
      ),
      yRange = Math.floor(
        this.#canvas.height / this.#layers[0].tileSize() / this.#scale
      );

    return [
      { x: this.#center.x - xRange, y: this.#center.y - yRange },
      { x: this.#center.x + xRange, y: this.#center.y + yRange },
    ];
  }

  public world(): World {
    return this.#world;
  }
}

export default Portal;
