import getPreloadedImage, {
  onPreloadedImagesChanged,
} from './getPreloadedImage';
import { Unit as UnitData } from '../types';
import { entityName } from '../components/lib/entity';
import { isDrawable } from './imageSize';
import replaceColours from './replaceColours';
import { s } from '@dom111/element';

// Keyed on everything that affects the output, so it is bounded by unit type x
// civilization colours x fortified — a few hundred entries at most for a given
// game, rather than one canvas per unit per render.
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
 * Writes a busy unit's letter onto `context`, over the unit drawn at
 * `offsetX`/`offsetY` and `scale` times its size (#352).
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
  tileSize: number = 16
): void => {
  const status = unitStatus(unit);

  if (status === null) {
    return;
  }

  // if (unit.busy._ === 'Sleeping') {} // TODO: fade the unit like in Civ 1
  const centreX = offsetX + (tileSize * scale) / 2,
    baseline = offsetY + tileSize * scale * 0.75;

  context.font = `bold ${8 * scale}px sans-serif`;
  context.textAlign = 'center';
  context.fillStyle = 'black';
  context.fillText(status, centreX + scale, baseline);
  context.fillStyle = 'white';
  context.fillText(status, centreX, baseline - scale);
};

/**
 * Renders `unit` with its civilization's colours and any fortified overlay. A
 * busy unit's letter is drawn by `drawUnitStatus`, once the unit is in place.
 *
 * The result may be a shared cache entry, so callers must treat it as immutable.
 */
export const renderUnit = (
  unit: Pick<UnitData, '_' | 'player' | 'improvements'>
): CanvasImageSource => {
  const player = unit.player,
    civilization = player.civilization,
    [colors] = civilization.attributes.filter(
      (attribute) => attribute.name === 'colors'
    ),
    fortified =
      unit.improvements?.some((improvement) => improvement._ === 'Fortified') ??
      false,
    key = [unit._, colors.value.join(','), fortified ? 'fortified' : ''].join(
      '|'
    );

  if (renderedUnitCache.has(key)) {
    return renderedUnitCache.get(key)!;
  }

  const source = getPreloadedImage(`units/${unit._.toLowerCase()}`),
    recoloured = replaceColours(
      source,
      // To come from theme manifest
      ['#60E064', '#2C7800'],
      colors.value
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
    const fortify = getPreloadedImage('map/fortify');

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
