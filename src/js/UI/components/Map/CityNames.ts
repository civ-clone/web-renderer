import { Tile } from '../../types';
import { Map } from '../Map';
import { instance as localeProvider } from '../../LocaleProvider';
import { cityName } from '../lib/city';

type Box = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const intersects = (a: Box, b: Box): boolean =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;

export class CityNames extends Map {
  // What is currently on the canvas and where, keyed by `x,y`. Keeping it lets
  // an update clear only the boxes it invalidated instead of the whole canvas,
  // and find the labels to redraw without walking every tile in the world.
  // Plain objects because `Map` in this file is the layer base class.
  #drawn: { [key: string]: Box[] } = {};

  render(tiles: Tile[] = this.world().tiles()): void {
    this.clear();

    this.#drawn = {};

    tiles.forEach(({ x, y }: Tile) => this.renderTile(this.world().get(x, y)));
  }

  renderTile(tile: Tile): void {
    if (!tile.city) {
      return;
    }

    // Clearing is the caller's job here — `render` clears the canvas and
    // `update` clears the boxes — because a label is wider than its tile, so
    // clearing just the tile would leave most of the old label behind.
    this.#drawn[`${tile.x},${tile.y}`] = this.#offsets(tile).map(([dx, dy]) =>
      this.#drawLabel(tile, dx, dy)
    );
  }

  update(tilesToUpdate: Tile[]): void {
    const dirty: Box[] = [];

    tilesToUpdate.forEach(({ x, y }: Tile) => {
      const key = `${x},${y}`,
        previous = this.#drawn[key];

      if (previous) {
        dirty.push(...previous);

        delete this.#drawn[key];
      }

      const tile = this.world().get(x, y);

      if (tile.city) {
        this.#offsets(tile).forEach(([dx, dy]) =>
          dirty.push(this.#boxFor(tile, dx, dy))
        );
      }
    });

    if (dirty.length === 0) {
      return;
    }

    dirty.forEach(({ left, top, width, height }) =>
      this.context().clearRect(left, top, width, height)
    );

    // A label overhangs its neighbours, so clearing one box can bite into
    // another city's; redraw every label still standing that overlapped what
    // was cleared, along with the updated tiles that have a city.
    const toRedraw = new Set<string>(
      Object.keys(this.#drawn).filter((key) =>
        this.#drawn[key].some((box) =>
          dirty.some((cleared) => intersects(box, cleared))
        )
      )
    );

    tilesToUpdate.forEach(({ x, y }: Tile) => {
      if (this.world().get(x, y).city) {
        toRedraw.add(`${x},${y}`);
      }
    });

    toRedraw.forEach((key) => {
      const [x, y] = key.split(',').map(Number);

      this.renderTile(this.world().get(x, y));
    });
  }

  // The label is centred on its tile and wider than it, so where it crosses an
  // edge it also has to be drawn offset by the canvas size: `Portal.render()`
  // tiles this canvas, so that is where the overflow belongs. Without it the
  // overflow is clipped and appears nowhere, which loses most of a long name
  // on the first and last columns and all of any name on the last row.
  #offsets(tile: Tile): [number, number][] {
    const { left, top, width, height } = this.#boxFor(tile, 0, 0),
      canvasWidth = this.canvas().width,
      canvasHeight = this.canvas().height,
      columns = [0],
      rows = [0],
      offsets: [number, number][] = [];

    if (left < 0) {
      columns.push(canvasWidth);
    }

    if (left + width > canvasWidth) {
      columns.push(-canvasWidth);
    }

    if (top < 0) {
      rows.push(canvasHeight);
    }

    if (top + height > canvasHeight) {
      rows.push(-canvasHeight);
    }

    columns.forEach((dx) => rows.forEach((dy) => offsets.push([dx, dy])));

    return offsets;
  }

  #boxFor(tile: Tile, dx: number, dy: number): Box {
    const size = this.tileSize(),
      scale = this.scale(),
      city = tile.city!,
      centreX = tile.x * size + size / 2 + dx,
      digitBaseline = tile.y * size + size * 0.75 + dy,
      nameBaseline = tile.y * size + size * 1.6 + dy;

    this.#applyFont();

    const widest = Math.max(
        this.context().measureText(cityName(city)).width,
        this.context().measureText(localeProvider.number(city.growth.size))
          .width
      ),
      // Generous rather than measured: comfortably more than the ascent of a
      // `8 * scale`px font, so the box never crops the glyphs.
      ascent = 8 * scale + scale;

    return {
      left: Math.floor(centreX - widest / 2 - scale * 2),
      top: Math.floor(digitBaseline - ascent - scale * 2),
      width: Math.ceil(widest + scale * 4),
      height: Math.ceil(nameBaseline - digitBaseline + ascent + scale * 4),
    };
  }

  #drawLabel(tile: Tile, dx: number, dy: number): Box {
    const size = this.tileSize(),
      scale = this.scale(),
      city = tile.city!,
      centreX = tile.x * size + size / 2 + dx,
      digitBaseline = tile.y * size + size * 0.75 + dy,
      nameBaseline = tile.y * size + size * 1.6 + dy,
      sizeText = localeProvider.number(city.growth.size),
      name = cityName(city);

    this.#applyFont();

    this.context().fillStyle = 'black';
    this.context().fillText(sizeText, centreX + scale, digitBaseline);
    this.context().fillText(name, centreX + scale, nameBaseline);
    this.context().fillStyle = 'white';
    this.context().fillText(sizeText, centreX, digitBaseline - scale);
    this.context().fillText(name, centreX, nameBaseline - scale);

    return this.#boxFor(tile, dx, dy);
  }

  #applyFont(): void {
    this.context().font = `bold ${8 * this.scale()}px sans-serif`;
    this.context().textAlign = 'center';
  }
}

export default CityNames;
