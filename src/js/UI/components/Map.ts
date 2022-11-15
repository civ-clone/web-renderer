import { NeighbourDirection, Tile } from '../types';
import {
  getPreloadedImage,
  preloadContainer,
  setPreloadContainer,
} from '../lib/getPreloadedImage';
import World from './World';
import { e } from '../lib/html';
import replaceColours from '../lib/replaceColours';

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

export class Map implements IMap {
  #canvas: HTMLCanvasElement;
  #context: CanvasRenderingContext2D;
  #visible: boolean = true;
  #scale: number;
  #tileSize: number;
  #world: World;

  constructor(
    world: World,
    scale: number = 2,
    tileSize: number = 16,
    canvas: HTMLCanvasElement = e('canvas') as HTMLCanvasElement
  ) {
    this.#canvas = canvas;
    this.#world = world;
    this.#tileSize = tileSize;
    this.#scale = scale;

    this.setCanvasSize();

    this.#context = this.#canvas.getContext('2d') as CanvasRenderingContext2D;
    setPreloadContainer(document.querySelector('#preload')!);
  }

  canvas(): HTMLCanvasElement {
    return this.#canvas;
  }

  clear(): void {
    this.context().clearRect(0, 0, this.canvas().width, this.canvas().height);
  }

  context(): CanvasRenderingContext2D {
    return this.#context;
  }

  render(tiles: Tile[] = this.world().tiles()): void {
    this.clear();

    tiles.forEach(({ x, y }: Tile) => this.renderTile(this.world().get(x, y)));
  }

  renderTile({ x, y }: Tile): void {
    const size = this.tileSize(),
      offsetX = x * size,
      offsetY = y * size;

    this.context().clearRect(offsetX, offsetY, size, size);
  }

  scale(): number {
    return this.#scale;
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

  protected drawImage(
    path: string,
    x: number,
    y: number,
    options: DrawImageOptions = {}
  ): void {
    const size = this.tileSize(),
      offsetX = x * size,
      offsetY = y * size,
      image = this.getPreloadedImage(path);

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

  protected putImage(
    image: CanvasImageSource,
    offsetX: number,
    offsetY: number
  ): void {
    this.#context.imageSmoothingEnabled = false;

    this.#context.drawImage(
      image,
      offsetX,
      offsetY,
      (image.width as number) * this.#scale,
      (image.height as number) * this.#scale
    );
  }

  protected replaceColours(
    image: CanvasImageSource,
    source: string[],
    replacement: string[]
  ) {
    return replaceColours(image, source, replacement);
  }

  protected setCanvasSize(): void {
    this.#canvas.height = this.#world.height() * this.tileSize();
    this.#canvas.width = this.#world.width() * this.tileSize();
    // this.#canvas.setAttribute('height', this.#canvas.height.toString());
    // this.#canvas.setAttribute('width',this.#canvas.width.toString());
  }

  isVisible(): boolean {
    return this.#visible;
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
  }
}

export default Map;
