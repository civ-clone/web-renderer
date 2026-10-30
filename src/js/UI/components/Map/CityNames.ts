import { Tile } from '../../types';
import { Map } from '../Map';
import { Reach } from '../../lib/projection';
import { Rect } from '../../lib/viewport';
import { instance as localeProvider } from '../../LocaleProvider';
import { cityName } from '../lib/city';
import { imageSize } from '../../lib/imageSize';

const disorderIconPath = 'city/people_unhappy_m';

export class CityNames extends Map {
  // The tiles a label was last drawn for, as `x,y`: an update has to clear the label of a city that has gone, and
  //  needn't touch a tile that has no city and had none.
  #labelled: Set<string> = new Set();

  render(tiles: Tile[] = this.visibleTiles()): void {
    this.#labelled.clear();

    super.render(tiles);
  }

  // A label is wider than its tile and overlaps its neighbours' labels, so it is redrawn as a region (`reach()`): the
  //  labels it overlaps are cleared and drawn again with it, rather than drawn over themselves (#486).
  update(tilesToUpdate: Tile[]): void {
    const changed = tilesToUpdate.filter(
      ({ x, y }: Tile) =>
        this.#labelled.has(`${x},${y}`) || Boolean(this.world().get(x, y).city)
    );

    super.update(changed);

    // Only once its label has been cleared. A redraw that comes first, a scroll before the update reaches the map,
    //  finds the city gone and draws nothing there, but clears only its own part of the label.
    changed.forEach(({ x, y }: Tile) => {
      if (!this.world().get(x, y).city) {
        this.#labelled.delete(`${x},${y}`);
      }
    });
  }

  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    if (!tile.city) {
      return;
    }

    this.#labelled.add(`${tile.x},${tile.y}`);

    this.#drawLabel(tile, offsetX, offsetY);
  }

  // A label is centred on its tile and much wider than it, so a city several tiles off the canvas can still have its
  //  name reach on to it, and the region an update clears has to be as wide as the widest name. The widest in the city
  //  lists, "Augusta Praetoria Salassorum" and "Raurkela Industrial Township" (28 characters), reach about three
  //  and a quarter tiles past their tile in a bold sans-serif at the tileset's size; four leaves room for a wider
  //  system font.
  protected overhang(): number {
    return this.tileSize() * 4;
  }

  // As far as a label can reach past its tile: the overhang either side, and from the top of the size to the bottom of
  //  the name, which hangs below the tile. Generous rather than measured: the text is taken to rise a scale step more
  //  than the font size, and to fall two below its baseline, with a pixel more each way for rounding, so the region
  //  never crops a glyph. The unhappy citizen in place of the size, a citizen no taller than the tile drawn a scale
  //  step down, ends well above the name; its image isn't looked at here, as it is only drawn for a city in disorder.
  protected reach(): Reach {
    const reach = super.reach(),
      overhang = this.overhang(),
      scale = this.scale(),
      { height } = this.projection().footprint(),
      { digitBaseline, nameBaseline } = this.#anchor(0, 0),
      top = digitBaseline - this.#fontSize() - scale * 3,
      bottom = Math.max(nameBaseline + scale * 2, height + scale);

    return {
      top: reach.top + Math.max(0, Math.ceil(-top) + 1),
      right: reach.right + overhang,
      bottom: reach.bottom + Math.max(0, Math.ceil(bottom - height) + 1),
      left: reach.left + overhang,
    };
  }

  // Where the unhappy citizen goes in place of the size, where the tileset puts it: Civ1's is one pixel in from the
  //  centre of the city square, and one down, as Civ1 draws a city in civil disorder (CivOne's `Icons.City` puts it
  //  at 5, 1).
  #disorderIcon(offsetX: number, offsetY: number): Rect {
    const scale = this.scale(),
      { x, y } = this.tileset().cities.labels.disorderIcon,
      [width, height] = imageSize(this.getPreloadedImage(disorderIconPath)).map(
        (dimension) => dimension * scale
      );

    return {
      x: Math.floor(offsetX + x * scale),
      y: Math.floor(offsetY + y * scale),
      width: Math.ceil(width),
      height: Math.ceil(height),
    };
  }

  #drawLabel(tile: Tile, offsetX: number, offsetY: number): void {
    const scale = this.scale(),
      city = tile.city!,
      { centreX, digitBaseline, nameBaseline } = this.#anchor(offsetX, offsetY),
      sizeText = localeProvider.number(city.growth.size),
      name = cityName(city);

    // In civil disorder the size gives way to an unhappy citizen.
    const lines: [string, number][] = [[name, nameBaseline]];

    if (city.civilDisorderDeclared) {
      const { x, y } = this.#disorderIcon(offsetX, offsetY);

      this.putImage(this.getPreloadedImage(disorderIconPath), x, y);
    } else {
      lines.unshift([sizeText, digitBaseline]);
    }

    this.#applyFont();

    this.context().fillStyle = 'black';
    lines.forEach(([text, baseline]) =>
      this.context().fillText(text, centreX + scale, baseline)
    );
    this.context().fillStyle = 'white';
    lines.forEach(([text, baseline]) =>
      this.context().fillText(text, centreX, baseline - scale)
    );
  }

  // Where a label goes on the tile's box, as parts of it, where the tileset says: Civ1's are centred across it, the
  //  size three quarters of the way down and the name hanging below it.
  #anchor(
    offsetX: number,
    offsetY: number
  ): { centreX: number; digitBaseline: number; nameBaseline: number } {
    const { width, height } = this.projection().footprint(),
      { x, sizeBaseline, nameBaseline } = this.tileset().cities.labels;

    return {
      centreX: offsetX + width * x,
      digitBaseline: offsetY + height * sizeBaseline,
      nameBaseline: offsetY + height * nameBaseline,
    };
  }

  // The tileset's label size, in px at this scale.
  #fontSize(): number {
    return this.tileset().cities.labels.fontSize * this.scale();
  }

  #applyFont(): void {
    this.context().font = `bold ${this.#fontSize()}px sans-serif`;
    this.context().textAlign = 'center';
  }
}

export default CityNames;
