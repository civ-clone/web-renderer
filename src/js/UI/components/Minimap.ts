import Map from './Map';
import Portal from './Portal';
import World from './World';

export class Minimap {
  #context: CanvasRenderingContext2D;
  #element: HTMLCanvasElement;
  #layers: Map[];
  #portal: Portal;
  #world: World;

  constructor(
    element: HTMLCanvasElement,
    world: World,
    portal: Portal,
    ...layers: Map[]
  ) {
    this.#element = element;
    this.#world = world;
    this.#portal = portal;
    this.#layers = layers;

    this.#context = this.#element.getContext('2d')!;

    this.#element.addEventListener('click', (event) => {
      const x = event.offsetX - this.#element.offsetLeft,
        y = event.offsetY - this.#element.offsetTop,
        tileX = Math.ceil(
          (x / this.#element.offsetWidth) * this.#world.width()
        ),
        tileY = Math.ceil(
          (y / this.#element.offsetHeight) * this.#world.height()
        );

      this.#portal.setCenter(tileX, tileY);
      this.update();
    });
  }

  update(): void {
    const targetHeight =
      this.#layers[0].canvas().height * (190 / this.#layers[0].canvas().width);

    this.#element.height = targetHeight;
    this.#context.clearRect(0, 0, 190, targetHeight);

    this.#layers.forEach((layer) =>
      this.#context.drawImage(layer.canvas(), 0, 0, 190, targetHeight)
    );

    const [start, end] = this.#portal.visibleRange();

    // TODO: draw the rectangle replicated when close to the sides
    this.#context.lineWidth = 1;
    this.#context.strokeStyle = '#fff';
    this.#context.fillStyle = 'rgba(255, 255, 255, .2)';
    this.#context.rect(
      Math.floor((190 / this.#world.width()) * start.x),
      Math.floor((targetHeight / this.#world.height()) * start.y),
      Math.floor((190 / this.#world.width()) * (end.x - start.x)),
      Math.floor((targetHeight / this.#world.height()) * (end.y - start.y))
    );
    this.#context.stroke();
    this.#context.fill();
  }
}

export default Minimap;
