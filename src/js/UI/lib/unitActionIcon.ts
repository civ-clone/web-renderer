import { Tile, Unit, UnitAction } from '../types';
import getPreloadedImage from './getPreloadedImage';
import { imageSize, isDrawable } from './imageSize';
import replaceColours from './replaceColours';
import renderUnit from './renderUnit';

// What a unit action's button shows (#348), as layers drawn one over another. `unitActionIconLayers` decides it from
//  the action alone, so it can be checked without a canvas; `drawUnitActionIcon` paints it.
export type IconLayer =
  | { type: 'image'; path: string }
  | { type: 'unit'; unit: Unit; fortified: boolean; status: string }
  | { type: 'city'; text: string | null; colours: string[] | null };

export const iconSize = 16;

// A neutral square for the improvements to be shown on: nothing about the terrain they would really go on.
const square = (...paths: string[]): IconLayer[] =>
  ['terrain/land', 'terrain/grassland', ...paths].map((path) => ({
    type: 'image',
    path,
  }));

// The civilization's colours: the first is what a city is drawn on, the second its outline.
const civilizationColours = (unit: Unit): string[] | null =>
  unit.player?.civilization?.attributes?.find(
    (attribute) => attribute.name === 'colors'
  )?.value ?? null;

const unitLayer = (
  unit: Unit,
  status: string,
  fortified = false
): IconLayer => ({
  type: 'unit',
  unit,
  fortified,
  status,
});

/**
 * @param status The text drawn over the unit for actions that have no picture of their own: the same short marks the
 *  map puts on a busy unit.
 * @param tile The unit's tile as the world holds it, for the city and the cargo on it.
 */
export const unitActionIconLayers = (
  action: UnitAction,
  unit: Unit,
  tile: Tile | null,
  status: string
): IconLayer[] => {
  const fallback = [unitLayer(unit, status)];

  switch (action._) {
    case 'Fortify':
      return [unitLayer(unit, status, true)];

    case 'FoundCity':
      return [{ type: 'city', text: null, colours: civilizationColours(unit) }];

    case 'JoinCity':
      return [
        {
          type: 'city',
          text: String((tile?.city?.growth.size ?? 0) + 1),
          colours: civilizationColours(unit),
        },
      ];

    case 'SetHomeCity':
      // The city, marked as the unit's own, so it isn't mistaken for No orders.
      return [
        { type: 'city', text: status, colours: civilizationColours(unit) },
      ];

    case 'ClearForest':
    case 'ClearJungle':
    case 'ClearSwamp':
    case 'PlantForest':
      // Sent by the engine, which is what knows what the action leaves.
      return action.result
        ? [
            { type: 'image', path: 'terrain/land' },
            { type: 'image', path: `terrain/${action.result.toLowerCase()}` },
          ]
        : fallback;

    case 'BuildIrrigation':
      // Irrigation is drawn beneath the terrain on the map.
      return [
        { type: 'image', path: 'terrain/land' },
        { type: 'image', path: 'improvements/irrigation' },
        { type: 'image', path: 'terrain/grassland' },
      ];

    case 'BuildMine':
      return square('improvements/mine');

    case 'BuildRoad':
      return square('improvements/road_w', 'improvements/road_e');

    case 'BuildRailroad':
      return square('improvements/railroad_w', 'improvements/railroad_e');

    case 'Unload': {
      // The units aboard are not sent with the transport, so these are the stowed units on its tile.
      const cargo = (tile?.units ?? []).filter(
        (other) => other.busy?._ === 'Stowed'
      );

      return cargo.length > 0
        ? cargo.slice(0, 4).map((other) => unitLayer(other, ''))
        : fallback;
    }

    case 'EstablishTradeRoute':
      return [{ type: 'image', path: 'city/trade' }];

    default:
      return fallback;
  }
};

// Centred in the icon, as the unit and city pictures are narrower than it.
const drawCentred = (
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  offset = 0
): void => {
  if (!isDrawable(image)) {
    return;
  }

  const [width, height] = imageSize(image);

  context.drawImage(
    image,
    Math.floor((iconSize - width) / 2) + offset,
    Math.floor((iconSize - height) / 2) + offset
  );
};

const drawMark = (context: CanvasRenderingContext2D, text: string): void => {
  context.font = 'bold 8px sans-serif';
  context.textAlign = 'center';
  context.fillStyle = 'black';
  context.fillText(text, iconSize / 2, iconSize * 0.75);
  context.fillStyle = 'white';
  context.fillText(text, iconSize / 2, iconSize * 0.75);
};

export const drawUnitActionIcon = (
  canvas: HTMLCanvasElement,
  layers: IconLayer[]
): void => {
  const context = canvas.getContext('2d');

  if (!context) {
    return;
  }

  canvas.width = iconSize;
  canvas.height = iconSize;

  context.imageSmoothingEnabled = false;

  const stacked = layers.filter((layer) => layer.type === 'unit').length > 1;

  layers.forEach((layer, index) => {
    if (layer.type === 'image') {
      drawCentred(context, getPreloadedImage(layer.path));

      return;
    }

    if (layer.type === 'city') {
      const [background, outline] = layer.colours ?? [];

      // As the map does: the civilization's colour behind the city, and its second colour for the city itself.
      if (background) {
        context.fillStyle = background;
        context.fillRect(1, 1, iconSize - 2, iconSize - 2);
      }

      const city = getPreloadedImage('map/city');

      // Where the map puts it: a pixel in, over the colour.
      if (isDrawable(city)) {
        context.drawImage(
          outline ? replaceColours(city, ['#000'], [outline]) : city,
          1,
          1
        );
      }

      if (layer.text !== null) {
        drawMark(context, layer.text);
      }

      return;
    }

    // Cargo is a stack, each unit a little further along than the last.
    const offset = stacked ? index * 2 : 0;

    drawCentred(
      context,
      renderUnit({
        _: layer.unit._,
        player: layer.unit.player,
        improvements: layer.fortified ? [{ _: 'Fortified' } as any] : [],
        busy: null,
      }),
      offset
    );

    if (layer.status) {
      drawMark(context, layer.status);
    }
  });
};
