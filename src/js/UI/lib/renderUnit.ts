import {
  Colouring,
  TilesetDescriptor,
  expandName,
} from '../tilesets/TilesetDescriptor';
import currentTileset, { nativeTileSize } from './tilesets';
import getPreloadedImage, {
  onPreloadedImagesChanged,
} from './getPreloadedImage';
import { Unit as UnitData } from '../types';
import { entityName } from '../components/lib/entity';
import { isDrawable } from './imageSize';
import replaceColours from './replaceColours';
import { s } from '@dom111/element';

// Keyed on everything that affects the output, so it is bounded by tileset x unit
// type x civilization colours x fortified — a few hundred entries at most for a
// given game, rather than one canvas per unit per render.
const renderedUnitCache = new Map<string, HTMLCanvasElement>();

onPreloadedImagesChanged(() => renderedUnitCache.clear());

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
  { keys, colours }: Extract<Colouring, { mode: 'replaceColours' }>,
  playerColours: string[]
): string[] =>
  keys.map(
    (key, index) => playerColours[colours?.[index] ?? index] ?? playerColours[0]
  );

/** A player's colours, as their civilization's `colors` attribute lists them. */
export const playerColours = (player: UnitData['player']): string[] =>
  player.civilization.attributes.filter(
    (attribute) => attribute.name === 'colors'
  )[0].value;

/**
 * Writes a busy unit's letter onto `context`, over the unit drawn at
 * `offsetX`/`offsetY` and `scale` times its size (#352), on a tile `tileSize`
 * native px across, where `tileset` puts it.
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
  tileSize: number = nativeTileSize(currentTileset()),
  tileset: TilesetDescriptor = currentTileset()
): void => {
  const status = unitStatus(unit);

  if (status === null) {
    return;
  }

  // if (unit.busy._ === 'Sleeping') {} // TODO: fade the unit like in Civ 1
  const { x, baseline: down, fontSize: size } = tileset.units.status,
    centreX = offsetX + tileSize * scale * x,
    baseline = offsetY + tileSize * scale * down,
    fontSize = size * scale;

  context.font = `bold ${fontSize}px sans-serif`;
  context.textAlign = 'center';
  context.fillStyle = 'black';
  context.fillText(status, centreX + scale, baseline);
  context.fillStyle = 'white';
  context.fillText(status, centreX, baseline - scale);
};

/**
 * Renders `unit` with its civilization's colours and any fortified overlay, as
 * `tileset` draws them. A busy unit's letter is drawn by `drawUnitStatus`, once
 * the unit is in place.
 *
 * The result may be a shared cache entry, so callers must treat it as immutable.
 */
export const renderUnit = (
  unit: Pick<UnitData, '_' | 'player' | 'improvements'>,
  tileset: TilesetDescriptor = currentTileset()
): CanvasImageSource => {
  const colours = playerColours(unit.player),
    fortified =
      unit.improvements?.some((improvement) => improvement._ === 'Fortified') ??
      false,
    key = [
      tileset.id,
      unit._,
      colours.join(','),
      fortified ? 'fortified' : '',
    ].join('|');

  if (renderedUnitCache.has(key)) {
    return renderedUnitCache.get(key)!;
  }

  const { units, names } = tileset,
    // Only colour keys can be drawn yet: `validateDescriptor` refuses an overlay (#152).
    colouring = units.colouring as Extract<
      Colouring,
      { mode: 'replaceColours' }
    >,
    source = getPreloadedImage(
      expandName(units.sprite, {
        unit: names.unit[unit._] ?? unit._.toLowerCase(),
      }),
      tileset
    ),
    recoloured = replaceColours(
      source,
      colouring.keys,
      replacementColours(colouring, colours)
    ),
    // `replaceColours` may hand back a shared cache entry, so the overlays below
    // go onto a canvas of our own rather than drawing onto it.
    unitCanvas = s<HTMLCanvasElement>('<canvas></canvas>'),
    context = unitCanvas.getContext('2d')!;

  unitCanvas.width = recoloured.width;
  unitCanvas.height = recoloured.height;

  context.imageSmoothingEnabled = false;
  context.drawImage(recoloured, 0, 0);

  if (fortified) {
    const fortify = getPreloadedImage(units.fortified, tileset);

    if (isDrawable(fortify)) {
      context.drawImage(fortify, 0, 0);
    }
  }

  // Caching a unit drawn from an image that had not decoded yet would leave the
  // missing sprite in place for the rest of the session.
  if (isDrawable(source)) {
    renderedUnitCache.set(key, unitCanvas);
  }

  return unitCanvas;
};

export default renderUnit;
