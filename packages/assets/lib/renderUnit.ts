import {
  Colouring,
  Point,
  Size,
  TilesetDescriptor,
  expandName,
} from '../tilesets/TilesetDescriptor';
import { onSpriteAnchorsChanged, resolveAnchor } from './spriteAnchors';
import currentTileset, { nativeTileSize } from './tilesets';
import getPreloadedImage, {
  onPreloadedImagesChanged,
} from './getPreloadedImage';
import { Unit as UnitData } from '@civ-clone/ui-protocol/types';
import { entityName } from '@civ-clone/ui-platform/lib/entity';
import { imageSize, isDrawable } from './imageSize';
import replaceColours from './replaceColours';
import { s } from '@dom111/element';

// Keyed on everything that affects the output, so it is bounded by tileset x unit
// type x civilization colours x fortified (x stacked, for an overlay that shows
// a stack) — a few hundred entries at most for a given game, rather than one
// canvas per unit per render. The anchors an overlay is drawn at are the pack's,
// so a change to them empties it, as a change to the sprites does.
const renderedUnitCache = new Map<string, HTMLCanvasElement>();

onPreloadedImagesChanged(() => renderedUnitCache.clear());
onSpriteAnchorsChanged(() => renderedUnitCache.clear());

// The letter shown over a busy unit: the locale's icon for its busy state, or the
// capitals of the state's name.
const unitStatus = (unit: Pick<UnitData, 'busy'>): string | null =>
  unit.busy
    ? entityName(
        unit.busy,
        'unit',
        'Busy',
        'icon',
        entityName(unit.busy, 'unit', 'Busy').replace(/[a-z]+/g, '')
      )
    : null;

/**
 * The player's colours that replace `colouring`'s keys, one for each: the ones its `colours` names, or the player's
 * first, second, … in order (#56). A colour the player has none of is their first: a civilization with fewer colours
 * than the tileset asks for is drawn in the one it has rather than not at all.
 */
export const replacementColours = (
  { keys, colours }: Pick<Colouring, 'keys' | 'colours'>,
  playerColours: string[]
): string[] =>
  keys.map(
    (key, index) =>
      // Every civilization has at least one colour.
      playerColours[colours?.[index] ?? index] ?? playerColours[0]!
  );

/** A player's colours, as their civilization's `colors` attribute lists them. */
export const playerColours = (player: UnitData['player']): string[] =>
  player.civilization.attributes.filter(
    (attribute) => attribute.name === 'colors'
    // Every civilization carries its colours.
  )[0]!.value;

/**
 * Writes a busy unit's letter onto `context`, over the unit drawn at
 * `offsetX`/`offsetY` and `scale` times its size (#352), on a tile `tileSize`
 * native px across and down, where `tileset` puts it: its `x` is a part of the
 * tile's width and its baseline of its height.
 *
 * It is written at the size it is shown at, as the city labels are, rather than
 * into the sprite, which is then enlarged pixel by pixel.
 */
export const drawUnitStatus = (
  context: CanvasRenderingContext2D,
  unit: Pick<UnitData, 'busy'>,
  offsetX: number,
  offsetY: number,
  scale: number,
  tileSize: Size = nativeTileSize(currentTileset()),
  tileset: TilesetDescriptor = currentTileset()
): void => {
  const status = unitStatus(unit);

  if (status === null) {
    return;
  }

  // if (unit.busy._ === 'Sleeping') {} // TODO: fade the unit like in Civ 1
  const { x, baseline: down, fontSize: size } = tileset.units.status,
    centreX = offsetX + tileSize.width * scale * x,
    baseline = offsetY + tileSize.height * scale * down,
    fontSize = size * scale;

  context.font = `bold ${fontSize}px sans-serif`;
  context.textAlign = 'center';
  context.fillStyle = 'black';
  context.fillText(status, centreX + scale, baseline);
  context.fillStyle = 'white';
  context.fillText(status, centreX, baseline - scale);
};

/**
 * Draws a damaged unit's hit points as a small bar over it (M2b): green while it has more than two thirds of its most,
 * yellow down to a third, then red, on a dark ground the width of the whole. A unit at full strength, or one whose rules
 * send no hit points (Civ1's), has none. Drawn at the size it is shown at, as `drawUnitStatus` writes the busy letter,
 * and never into `renderUnit`'s cached sprite, which would then need one for every number of hit points. It is centred
 * where the letter is and above it, as wide as two letters or three quarters of the tile, whichever is less.
 */
export const drawUnitHitPoints = (
  context: CanvasRenderingContext2D,
  unit: Pick<UnitData, 'hitPoints'>,
  offsetX: number,
  offsetY: number,
  scale: number,
  tileSize: Size = nativeTileSize(currentTileset()),
  tileset: TilesetDescriptor = currentTileset()
): void => {
  const hitPoints = unit.hitPoints;

  if (!hitPoints || hitPoints.max <= 0 || hitPoints.current >= hitPoints.max) {
    return;
  }

  const { x, baseline: down, fontSize: size } = tileset.units.status,
    share = Math.max(0, hitPoints.current) / hitPoints.max,
    width = Math.round(Math.min(tileSize.width * 0.75, size * 2) * scale),
    height = Math.max(2, Math.round(size / 4)) * scale,
    // The dark edge round the lit share: a screen pixel or so, however large the map is drawn.
    edge = Math.max(1, Math.round(scale / 2)),
    left = Math.round(offsetX + tileSize.width * scale * x - width / 2),
    top = Math.round(
      offsetY + tileSize.height * scale * down - (size + 3) * scale - height
    );

  context.fillStyle = 'black';
  context.fillRect(left, top, width, height);
  context.fillStyle =
    share > 2 / 3 ? '#20c020' : share > 1 / 3 ? '#e0c000' : '#e02020';
  context.fillRect(
    left + edge,
    top + edge,
    Math.max(0, Math.round((width - 2 * edge) * share)),
    height - 2 * edge
  );
};

/**
 * Renders `unit` with its civilization's colours and any fortified overlay, as `tileset` draws them: its colour keys
 * swapped for the player's (Civ1's), or its overlay (Civ2's shield) swapped so and drawn over it at its anchor, with
 * the overlay's `stack` sprite behind that when the unit is `stacked`, one of several on its square. The overlay and
 * the stack's sprite are drawn within the unit's sprite, cut off where they would go past it. A busy unit's letter is
 * drawn by `drawUnitStatus`, once the unit is in place.
 *
 * The result may be a shared cache entry, so callers must treat it as immutable.
 */
export const renderUnit = (
  unit: Pick<UnitData, '_' | 'player' | 'improvements'>,
  tileset: TilesetDescriptor = currentTileset(),
  stacked: boolean = false
): CanvasImageSource => {
  const { units, names } = tileset,
    { colouring } = units,
    colours = playerColours(unit.player),
    fortified =
      unit.improvements?.some((improvement) => improvement._ === 'Fortified') ??
      false,
    // Only an overlay shows a stack in the unit itself; Civ1's is shown by a copy of it, which the map draws.
    showsStack =
      stacked && colouring.mode === 'overlay' && colouring.stack !== undefined,
    key = [
      tileset.id,
      unit._,
      colours.join(','),
      fortified ? 'fortified' : '',
      ...(showsStack ? ['stacked'] : []),
    ].join('|');

  if (renderedUnitCache.has(key)) {
    return renderedUnitCache.get(key)!;
  }

  const spriteName = expandName(units.sprite, {
      unit: names.unit[unit._] ?? unit._.toLowerCase(),
    }),
    source = getPreloadedImage(spriteName, tileset),
    replacements = replacementColours(colouring, colours),
    // Civ1's sprite recoloured, or Civ2's as it is, under its overlay.
    recoloured =
      colouring.mode === 'replaceColours'
        ? replaceColours(source, colouring.keys, replacements)
        : source,
    [width, height] = imageSize(recoloured),
    // `replaceColours` may hand back a shared cache entry, so the overlays below
    // go onto a canvas of our own rather than drawing onto it.
    unitCanvas = s<HTMLCanvasElement>('<canvas></canvas>'),
    context = unitCanvas.getContext('2d')!;
  // Whether every sprite this unit is drawn with was there to draw: one drawn without one would stay that way in the
  //  cache after it is loaded.
  let complete = isDrawable(source);

  unitCanvas.width = width;
  unitCanvas.height = height;

  context.imageSmoothingEnabled = false;

  // A missing sprite has no size, and `drawImage` throws on one.
  if (width > 0 && height > 0) {
    context.drawImage(recoloured, 0, 0);
  }

  if (colouring.mode === 'overlay') {
    const anchor = resolveAnchor(tileset, spriteName, colouring.anchor),
      // The overlay's sprite, or the stack's, with its keys swapped for the player's colours, where the anchor puts
      //  the overlay and `offset` from that.
      overlay = (sprite: string, { x, y }: Point): void => {
        const image = getPreloadedImage(sprite, tileset);

        if (!isDrawable(image)) {
          complete = false;

          return;
        }

        context.drawImage(
          replaceColours(image, colouring.keys, replacements),
          anchor!.x + x,
          anchor!.y + y
        );
      };

    // A sprite without the anchor is drawn without its shield, and cached so: setting the pack's anchors empties the
    //  cache, so it is drawn again with them.
    if (anchor !== null) {
      if (showsStack) {
        overlay(colouring.stack!.sprite, colouring.stack!.offset);
      }

      overlay(colouring.sprite, { x: 0, y: 0 });
    }
  }

  if (fortified) {
    const fortify = getPreloadedImage(units.fortified, tileset);

    if (isDrawable(fortify)) {
      context.drawImage(fortify, 0, 0);
    }
  }

  if (complete) {
    renderedUnitCache.set(key, unitCanvas);
  }

  return unitCanvas;
};

export default renderUnit;
