import { City, Tile } from '@civ-clone/ui-protocol/types';
import { CityNames } from './CityNames';
import { Reach } from '../../lib/projection';
import { Rect } from '../../lib/viewport';
import { buildTurns } from '@civ-clone/ui-client/lib/cityTurns';
import { cityName } from '@civ-clone/ui-client/components/lib/city';
import {
  groupIcons,
  reduceKnownYield,
} from '@civ-clone/ui-client/lib/yieldMap';
import { imageSize } from '@civ-clone/ui-assets/lib/imageSize';
import { instance as localeProvider } from '@civ-clone/ui-client/LocaleProvider';
import { playerColours } from '@civ-clone/ui-assets/lib/renderUnit';
import { readableOn } from '@civ-clone/ui-widgets/lib/contrast';

// The cities on the map under the new interface (#747): a banner below each city's square, as Civ V draws them, so the
//  empire reads without opening anything. The theme says which, through `--ui-city-banner`: `full` draws the banner,
//  `label` the name and size `CityNames` draws, so the Civ1-classic theme keeps today's look. Everything a banner says
//  is what the city's data carries: a city seen in full (your own) shows what it's building and how it grows, a rival's
//  only its size and name (#274).

const disorderIconPath = 'city/people_unhappy_m',
  celebratingIconPath = 'city/people_happy_m',
  productionIconPath = groupIcons.Production;

// What the banners take from the theme's tokens, read from the page's root when the layer draws.
export type BannerStyle = {
  // `full` for the banner, anything else for the classic label.
  form: string;
  background: string;
  foreground: string;
  edge: string;
  radius: number;
  family: string;
  weight: string;
  food: string;
  short: string;
  track: string;
  // The inks a badge's size is written in where its civilization's second colour doesn't read on its first.
  light: string;
  shade: string;
};

const token = (style: CSSStyleDeclaration, name: string): string =>
  style.getPropertyValue(name).trim();

/** The banners' tokens as the page's stylesheet sets them now. */
export const readBannerStyle = (
  root: HTMLElement = document.documentElement
): BannerStyle => {
  const style = getComputedStyle(root);

  return {
    form: token(style, '--ui-city-banner'),
    background: token(style, '--ui-city-banner-bg'),
    foreground: token(style, '--ui-city-banner-fg'),
    edge: token(style, '--ui-city-banner-edge'),
    radius: parseFloat(token(style, '--ui-city-banner-radius')) || 0,
    family: token(style, '--ui-city-banner-family') || 'sans-serif',
    weight: token(style, '--type-strong-weight') || 'bold',
    food: token(style, '--y-food'),
    short: token(style, '--y-short'),
    track: token(style, '--ui-city-banner-track'),
    light: token(style, '--ui-light'),
    shade: token(style, '--ui-shade'),
  };
};

// Where each part of one city's banner goes, in px on the layer's canvas.
type BannerLayout = {
  pill: Rect;
  badge: Rect;
  size: string;
  fontSize: number;
  // Nothing past the badge when the map is drawn too small for words.
  name: { text: string; x: number } | null;
  production: { icon: Rect; text: string; x: number } | null;
  flags: { path: string; rect: Rect }[];
  food: { track: Rect; fill: Rect; starving: boolean } | null;
  baseline: number;
};

export class CityBanners extends CityNames {
  #cachedStyle: BannerStyle | null = null;

  // The tokens are read again for each whole drawing: the theme, light or dark, or the fonts loaded, may have changed.
  render(tiles: Tile[] = this.visibleTiles()): void {
    this.#cachedStyle = null;

    super.render(tiles);
  }

  /** The city whose banner is under `x`, `y` on the canvas, if there is one: of banners that overlap, the one on top. */
  bannerAt(x: number, y: number): { city: City; box: Rect } | null {
    if (!this.isVisible() || !this.#full()) {
      return null;
    }

    const reach = this.reach(),
      candidates = this.tilesIn({
        x: x - reach.left,
        y: y - reach.bottom,
        width: reach.left + reach.right,
        height: reach.top + reach.bottom,
      }).filter((tile) => tile.city);

    // Front to back: the reverse of the order they're drawn in.
    for (const { tile, px, py } of this.placementsOf(candidates).reverse()) {
      const { pill, food } = this.#layout(tile, px, py),
        bottom = food ? food.track.y + food.track.height : pill.y + pill.height;

      if (x >= pill.x && x < pill.x + pill.width && y >= pill.y && y < bottom) {
        return {
          city: tile.city!,
          box: { ...pill, height: bottom - pill.y },
        };
      }
    }

    return null;
  }

  protected drawTile(tile: Tile, offsetX: number, offsetY: number): void {
    if (!tile.city || !this.#full()) {
      super.drawTile(tile, offsetX, offsetY);

      return;
    }

    this.markLabelled(tile);
    this.#drawBanner(tile, offsetX, offsetY);
  }

  // A banner is wider than the classic label by its badge, what's being built and its flags, nearly two tiles either side
  //  for the widest name with both flags: two more, so a wider fallback font, before the theme's has loaded, still fits.
  protected overhang(): number {
    return super.overhang() + this.tileSize() * 2;
  }

  // As the label's, and down to the bottom of the banner and its food bar.
  protected reach(): Reach {
    const reach = super.reach(),
      { height } = this.projection().footprint(),
      bottom = this.#top(0) + this.#pillHeight() + this.#foodHeight() * 2;

    return {
      ...reach,
      bottom: Math.max(reach.bottom, reach.bottom + Math.ceil(bottom - height)),
    };
  }

  #style(): BannerStyle {
    if (this.#cachedStyle === null) {
      this.#cachedStyle = this.bannerStyle();
    }

    return this.#cachedStyle;
  }

  /** The tokens to draw with; the page's own, unless a test says otherwise. */
  protected bannerStyle(): BannerStyle {
    return readBannerStyle();
  }

  #full(): boolean {
    return this.#style().form === 'full';
  }

  // Too small for more than the size and the name (#822): no production, flags or food bar.
  #compact(): boolean {
    return this.scale() < 2;
  }

  #fontSize(): number {
    return Math.round(this.tileset().cities.labels.fontSize * this.scale());
  }

  #padding(): number {
    return this.scale() * 2;
  }

  #pillHeight(): number {
    return Math.round(this.#fontSize() * 1.25) + this.scale() * 2;
  }

  #foodHeight(): number {
    return this.scale();
  }

  // Just below the city's square, which the city and the units in it keep to themselves.
  #top(offsetY: number): number {
    const { height } = this.projection().footprint();

    return offsetY + height + this.scale();
  }

  #font(): string {
    const { family, weight } = this.#style();

    return `${weight} ${this.#fontSize()}px ${family}`;
  }

  #measure(text: string): number {
    return Math.ceil(this.context().measureText(text).width);
  }

  #layout(tile: Tile, offsetX: number, offsetY: number): BannerLayout {
    const city = tile.city!,
      { width } = this.projection().footprint(),
      { x: labelX } = this.tileset().cities.labels,
      scale = this.scale(),
      fontSize = this.#fontSize(),
      padding = this.#padding(),
      height = this.#pillHeight(),
      top = this.#top(offsetY),
      size = localeProvider.number(city.growth.size);

    // Measured in the banner's font, which the label's drawing sets again for itself.
    this.context().save();
    this.context().font = this.#font();

    const badgeWidth = Math.max(height, this.#measure(size) + padding * 2),
      compact = this.#compact(),
      name = cityName(city),
      nameWidth = this.#measure(name),
      // What a city seen in full is building, and in how many turns; a dash for nothing, or for never.
      building = !compact && city.build ? city.build : null,
      turns = building?.building ? buildTurns(city) : 0,
      productionText = turns > 0 ? localeProvider.number(turns) : '–',
      iconSize = fontSize,
      productionWidth =
        building === null
          ? 0
          : iconSize + scale + this.#measure(productionText),
      flagPaths = compact
        ? []
        : [
            ...(city.civilDisorderDeclared ? [disorderIconPath] : []),
            ...(city.celebrateLeader ? [celebratingIconPath] : []),
          ],
      flagWidth = flagPaths.length * (iconSize + scale),
      contentWidth =
        badgeWidth +
        padding +
        nameWidth +
        padding +
        (productionWidth > 0 ? productionWidth + padding : 0) +
        flagWidth,
      left = Math.round(offsetX + width * labelX - contentWidth / 2),
      baseline = top + Math.round((height + fontSize * 0.7) / 2),
      iconTop = top + Math.round((height - iconSize) / 2);

    this.context().restore();

    let cursor = left + badgeWidth + padding;

    const nameLayout = { text: name, x: cursor };

    cursor += nameWidth + padding;

    const production =
      building === null
        ? null
        : {
            icon: { x: cursor, y: iconTop, width: iconSize, height: iconSize },
            text: productionText,
            x: cursor + iconSize + scale,
          };

    cursor += productionWidth > 0 ? productionWidth + padding : 0;

    const flags = flagPaths.map((path, index) => ({
        path,
        rect: {
          x: cursor + index * (iconSize + scale),
          y: iconTop,
          width: iconSize,
          height: iconSize,
        },
      })),
      perTurn = city.yields ? reduceKnownYield(city.yields, 'Food') : 0,
      growth = !compact && city.growth.cost ? city.growth : null,
      foodTrack = {
        x: left,
        y: top + height,
        width: contentWidth,
        height: this.#foodHeight(),
      };

    return {
      pill: { x: left, y: top, width: contentWidth, height },
      badge: { x: left, y: top, width: badgeWidth, height },
      size,
      fontSize,
      name: nameLayout,
      production,
      flags,
      food:
        growth === null || !city.build
          ? null
          : {
              track: foodTrack,
              fill: {
                ...foodTrack,
                // Starving, at least a sliver, so an empty store still shows red.
                width: Math.max(
                  perTurn < 0 ? this.scale() * 2 : 0,
                  Math.round(
                    foodTrack.width *
                      Math.min(
                        1,
                        Math.max(0, growth.progress.value) /
                          Math.max(1, growth.cost.value)
                      )
                  )
                ),
              },
              starving: perTurn < 0,
            },
      baseline,
    };
  }

  #drawBanner(tile: Tile, offsetX: number, offsetY: number): void {
    const context = this.context(),
      style = this.#style(),
      layout = this.#layout(tile, offsetX, offsetY),
      [primary, secondary] = playerColours(tile.city!.player),
      { pill, badge } = layout,
      radius = Math.min(style.radius * this.scale(), pill.height / 2);

    context.save();
    context.font = this.#font();
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';

    // The pill, then the badge in the civilization's colours over its left end.
    context.fillStyle = style.background;
    context.strokeStyle = style.edge;
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(
      pill.x + 0.5,
      pill.y + 0.5,
      pill.width - 1,
      pill.height - 1,
      radius
    );
    context.fill();
    context.stroke();

    context.fillStyle = primary;
    context.beginPath();
    context.roundRect(badge.x, badge.y, badge.width, badge.height, radius);
    context.fill();

    // The size in the civilization's second colour, where it reads on its first, which a sliver of a city's sprite
    //  doesn't need to (#778).
    context.fillStyle = readableOn(primary, secondary ?? style.foreground, [
      style.shade,
      style.light,
    ]);
    context.textAlign = 'center';
    context.fillText(layout.size, badge.x + badge.width / 2, layout.baseline);
    context.textAlign = 'left';

    context.fillStyle = style.foreground;

    if (layout.name !== null) {
      context.fillText(layout.name.text, layout.name.x, layout.baseline);
    }

    if (layout.production !== null) {
      this.#drawIcon(productionIconPath, layout.production.icon);
      context.fillText(
        layout.production.text,
        layout.production.x,
        layout.baseline
      );
    }

    layout.flags.forEach(({ path, rect }) => this.#drawIcon(path, rect));

    // How far the city is towards its next size, red when it's starving.
    if (layout.food !== null) {
      const { track, fill, starving } = layout.food;

      context.fillStyle = style.track;
      context.fillRect(track.x, track.y, track.width, track.height);
      context.fillStyle = starving ? style.short : style.food;
      context.fillRect(fill.x, fill.y, fill.width, fill.height);
    }

    context.restore();
  }

  // An icon from the tileset, fitted to `rect` and kept sharp.
  #drawIcon(path: string, rect: Rect): void {
    const image = this.getPreloadedImage(path),
      [width, height] = imageSize(image),
      fit = Math.min(rect.width / width, rect.height / height),
      context = this.context();

    context.imageSmoothingEnabled = false;
    context.drawImage(
      image,
      Math.round(rect.x + (rect.width - width * fit) / 2),
      Math.round(rect.y + (rect.height - height * fit) / 2),
      Math.round(width * fit),
      Math.round(height * fit)
    );
  }
}

export default CityBanners;
