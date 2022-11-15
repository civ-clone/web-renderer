import { Unit } from '../types';
import getPreloadedImage from './getPreloadedImage';
import replaceColours from './replaceColours';

const busyLookup: { [key: string]: string } = {
  BuildingIrrigation: 'I',
  BuildingMine: 'M',
  BuildingRoad: 'R',
  BuildingRailroad: 'RR',
  // 'ClearingForest': 'CF',
  // 'ClearingJungle': 'CJ',
  // 'ClearingSwamp': 'CS',
  // 'Fortifying': 'F',
  // 'Sleeping': 'S',
  // 'PlantingForest': 'PF',
};

export const renderUnit = (
  unit: Unit,
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
      identifier =
        busyLookup[unit.busy._] ?? unit.busy._.replace(/[a-z]+/g, '');

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
