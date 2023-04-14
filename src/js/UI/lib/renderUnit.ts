import { Unit as UnitData } from '../types';
import getPreloadedImage from './getPreloadedImage';
import replaceColours from './replaceColours';
import { entityName } from '../components/lib/entity';

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
    unitCanvas = replaceColours(
      getPreloadedImage(`units/${unit._.toLowerCase()}`),
      // To come from theme manifest
      ['#60E064', '#2C7800'],
      colors.value
    ),
    context = unitCanvas.getContext('2d')!;

  context.imageSmoothingEnabled = false;

  if (unit.improvements?.some((improvement) => improvement._ === 'Fortified')) {
    context.drawImage(getPreloadedImage('map/fortify'), 0, 0);
  }

  if (unit.busy) {
    // if (unit.busy._ === 'Sleeping') {} // TODO: fade the unit like in Civ 1
    const sizeOffsetX = tileSize / 2,
      sizeOffsetY = tileSize * 0.75,
      identifier = entityName(
        unit.busy,
        'unit',
        'Busy',
        'icon',
        entityName(unit.busy, 'unit', 'Busy').replace(/[a-z]+/g, '')
      );

    context.font = `bold 8px sans-serif`;
    context.fillStyle = 'black';
    context.textAlign = 'center';
    context.fillText(identifier, sizeOffsetX, sizeOffsetY);
    context.fillStyle = 'white';
    context.fillText(identifier, sizeOffsetX, sizeOffsetY);
  }

  return unitCanvas;
};

export default renderUnit;
