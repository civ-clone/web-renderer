import getPreloadedImage, {
  onPreloadedImagesChanged,
} from './getPreloadedImage';
import { Unit as UnitData } from '../types';
import { entityName } from '../components/lib/entity';
import { isDrawable } from './imageSize';
import replaceColours from './replaceColours';
import { s } from '@dom111/element';

// Keyed on everything that affects the output, so it is bounded by unit type x
// civilization colours x fortified x busy state — a few hundred entries at most
// for a given game, rather than one canvas per unit per render.
const renderedUnitCache = new Map<string, HTMLCanvasElement>();

onPreloadedImagesChanged(() => renderedUnitCache.clear());

/**
 * Renders `unit` with its civilization's colours and any fortified/busy overlay.
 *
 * The result may be a shared cache entry, so callers must treat it as immutable.
 */
export const renderUnit = (
  unit: Pick<UnitData, '_' | 'player' | 'improvements' | 'busy'>,
  // scale: number = 2,
  tileSize: number = 16
): CanvasImageSource => {
  const player = unit.player,
    civilization = player.civilization,
    [colors] = civilization.attributes.filter(
      (attribute) => attribute.name === 'colors'
    ),
    fortified =
      unit.improvements?.some((improvement) => improvement._ === 'Fortified') ??
      false,
    busyIdentifier = unit.busy
      ? entityName(
          unit.busy,
          'unit',
          'Busy',
          'icon',
          entityName(unit.busy, 'unit', 'Busy').replace(/[a-z]+/g, '')
        )
      : null,
    key = [
      unit._,
      colors.value.join(','),
      tileSize,
      fortified ? 'fortified' : '',
      busyIdentifier ?? '',
    ].join('|');

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

  if (busyIdentifier !== null) {
    // if (unit.busy._ === 'Sleeping') {} // TODO: fade the unit like in Civ 1
    const sizeOffsetX = tileSize / 2,
      sizeOffsetY = tileSize * 0.75;

    context.font = `bold 8px sans-serif`;
    context.fillStyle = 'black';
    context.textAlign = 'center';
    context.fillText(busyIdentifier, sizeOffsetX, sizeOffsetY);
    context.fillStyle = 'white';
    context.fillText(busyIdentifier, sizeOffsetX, sizeOffsetY);
  }

  // Caching a unit drawn from an image that had not decoded yet would leave the
  // missing sprite in place for the rest of the session.
  if (isDrawable(source)) {
    renderedUnitCache.set(key, unitCanvas);
  }

  return unitCanvas;
};

export default renderUnit;
