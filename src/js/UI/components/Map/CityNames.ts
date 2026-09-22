import { Tile } from '../../types';
import { Map } from '../Map';
import { Rect, rectsIntersect } from '../../lib/viewport';
import { instance as localeProvider } from '../../LocaleProvider';
import { cityName } from '../lib/city';

export class CityNames extends Map {
  // What is currently on the canvas and where, keyed by `x,y`. Keeping it lets
  // an update clear only the boxes it invalidated instead of the whole canvas,
  // and find the labels to redraw without walking every tile in the world.
  // Plain objects because `Map` in this file is the layer base class.
  #drawn: { [key: string]: Rect[] } = {};

  render(tiles: Tile[] = this.visibleTiles()): void {
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
    this.#drawn[`${tile.x},${tile.y}`] = this.placements(tile).map(
      ([offsetX, offsetY]) => {
        const box = this.#drawLabel(tile, offsetX, offsetY);

        this.markDirty(box.x, box.y, box.width, box.height);

        return box;
      }
    );
  }

  update(tilesToUpdate: Tile[]): void {
    const dirty: Rect[] = [];

    tilesToUpdate.forEach(({ x, y }: Tile) => {
      const key = `${x},${y}`,
        previous = this.#drawn[key];

      if (previous) {
        dirty.push(...previous);

        delete this.#drawn[key];
      }

      const tile = this.world().get(x, y);

      if (tile.city) {
        this.placements(tile).forEach(([offsetX, offsetY]) =>
          dirty.push(this.#boxFor(tile, offsetX, offsetY))
        );
      }
    });

    if (dirty.length === 0) {
      return;
    }

    dirty.forEach(({ x, y, width, height }) => {
      this.context().clearRect(x, y, width, height);

      this.markDirty(x, y, width, height);
    });

    // A label overhangs its neighbours, so clearing one box can bite into
    // another city's; redraw every label still standing that overlapped what
    // was cleared, along with the updated tiles that have a city.
    const toRedraw = new Set<string>(
      Object.keys(this.#drawn).filter((key) =>
        this.#drawn[key].some((box) =>
          dirty.some((cleared) => rectsIntersect(box, cleared))
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

  // A label is centred on its tile and much wider than it, so a city several
  // tiles off the canvas can still have its name reach on to it. Three tiles
  // either side is comfortably more than the longest name in the locale files.
  protected overhang(): number {
    return this.tileSize() * 3;
  }

  // The boxes are recorded in canvas co-ordinates, so moving the window
  // invalidates every one of them. Only tiles with cities are drawn at all, so
  // starting again is cheaper than moving the record along with the canvas.
  protected scrollTo(originX: number, originY: number): void {
    this.setOrigin(originX, originY);

    this.render();
  }

  #boxFor(tile: Tile, offsetX: number, offsetY: number): Rect {
    const size = this.tileSize(),
      scale = this.scale(),
      city = tile.city!,
      centreX = offsetX + size / 2,
      digitBaseline = offsetY + size * 0.75,
      nameBaseline = offsetY + size * 1.6;

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
      x: Math.floor(centreX - widest / 2 - scale * 2),
      y: Math.floor(digitBaseline - ascent - scale * 2),
      width: Math.ceil(widest + scale * 4),
      height: Math.ceil(nameBaseline - digitBaseline + ascent + scale * 4),
    };
  }

  #drawLabel(tile: Tile, offsetX: number, offsetY: number): Rect {
    const size = this.tileSize(),
      scale = this.scale(),
      city = tile.city!,
      centreX = offsetX + size / 2,
      digitBaseline = offsetY + size * 0.75,
      nameBaseline = offsetY + size * 1.6,
      sizeText = localeProvider.number(city.growth.size),
      name = cityName(city);

    this.#applyFont();

    this.context().fillStyle = 'black';
    this.context().fillText(sizeText, centreX + scale, digitBaseline);
    this.context().fillText(name, centreX + scale, nameBaseline);
    this.context().fillStyle = 'white';
    this.context().fillText(sizeText, centreX, digitBaseline - scale);
    this.context().fillText(name, centreX, nameBaseline - scale);

    return this.#boxFor(tile, offsetX, offsetY);
  }

  #applyFont(): void {
    this.context().font = `bold ${8 * this.scale()}px sans-serif`;
    this.context().textAlign = 'center';
  }
}

export default CityNames;
