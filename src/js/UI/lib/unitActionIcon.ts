import { Tile, Unit, UnitAction } from '../types';
import getPreloadedImage from './getPreloadedImage';
import { imageSize, isDrawable } from './imageSize';
import { Colouring, TilesetDescriptor } from '../tilesets/TilesetDescriptor';
import currentTileset from './tilesets';
import replaceColours from './replaceColours';
import renderUnit, { replacementColours } from './renderUnit';

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
  status: string,
  tileset: TilesetDescriptor = currentTileset()
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

    case 'BuildIrrigation': {
      // As the map draws it (`Landscape`): beneath the terrain, or over it when the tileset says so.
      const { sprite, overTerrain } = tileset.families.irrigation,
        irrigation: IconLayer = { type: 'image', path: sprite },
        grassland: IconLayer = { type: 'image', path: 'terrain/grassland' };

      return [
        { type: 'image', path: 'terrain/land' },
        ...(overTerrain ? [grassland, irrigation] : [irrigation, grassland]),
      ];
    }

    case 'BuildMine':
      return square('improvements/mine');

    case 'CleanPollution':
      return square('improvements/pollution');

    case 'BuildRoad':
    case 'RoadTo':
      return square('improvements/road_w', 'improvements/road_e');

    case 'BuildRailroad':
    case 'RailroadTo':
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

// The part of a picture that has anything drawn in it, as [left, top, width, height]: a Civ1 unit is 15 pixels of
//  drawing in a 16 pixel square, its empty column and row on the right and at the bottom, so centring the square
//  leaves the unit up and to the left. Kept per picture, as the pictures are shared and never change.
const drawnAreas = new WeakMap<object, [number, number, number, number]>();

const drawnArea = (
  image: CanvasImageSource
): [number, number, number, number] => {
  const [width, height] = imageSize(image),
    known = drawnAreas.get(image);

  if (known) {
    return known;
  }

  let area: [number, number, number, number] = [0, 0, width, height];

  try {
    const canvas = document.createElement('canvas'),
      context = canvas.getContext('2d');

    if (context) {
      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0);

      const { data } = context.getImageData(0, 0, width, height);
      let left = width,
        right = -1,
        top = height,
        bottom = -1;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 0) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }

      if (right >= left) {
        area = [left, top, right - left + 1, bottom - top + 1];
      }
    }
  } catch {
    // A picture that can't be read is centred by its size.
  }

  drawnAreas.set(image, area);

  return area;
};

// Centred in the icon by what is drawn in it, as the unit and city pictures are narrower than it. At the screen's
//  scale, to a whole pixel there, so a half-pixel shift doesn't blur or unevenly stretch the pixel art.
const drawCentred = (
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  offset = 0,
  scale = 1
): void => {
  if (!isDrawable(image)) {
    return;
  }

  const [left, top, width, height] = drawnArea(image),
    centre = (start: number, size: number): number =>
      Math.round(((iconSize - size) / 2 - start) * scale) / scale;

  context.drawImage(
    image,
    centre(left, width) + offset,
    centre(top, height) + offset
  );
};

// Offset as the map's unit and city labels are, a pixel of the picture apart.
const drawMark = (context: CanvasRenderingContext2D, text: string): void => {
  context.font = 'bold 8px sans-serif';
  context.textAlign = 'center';
  context.fillStyle = 'black';
  context.fillText(text, iconSize / 2 + 1, iconSize * 0.75);
  context.fillStyle = 'white';
  context.fillText(text, iconSize / 2, iconSize * 0.75 - 1);
};

// How many of the canvas's pixels make one of the picture's: as many as the screen shows it at (#352), so the
//  marks are written at that size rather than enlarged. A canvas not laid out yet is shown at the picture's own size.
export const iconScale = (canvas: HTMLCanvasElement): number =>
  ((canvas.clientWidth || iconSize) * (globalThis.devicePixelRatio || 1)) /
  iconSize;

export const drawUnitActionIcon = (
  canvas: HTMLCanvasElement,
  layers: IconLayer[]
): void => {
  const context = canvas.getContext('2d');

  if (!context) {
    return;
  }

  const scale = iconScale(canvas);

  canvas.width = Math.round(iconSize * scale);
  canvas.height = Math.round(iconSize * scale);

  // Drawn in the picture's own pixels; the sprites are enlarged pixel by pixel, and the marks written at full size.
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.imageSmoothingEnabled = false;

  const stacked = layers.filter((layer) => layer.type === 'unit').length > 1;

  layers.forEach((layer, index) => {
    if (layer.type === 'image') {
      drawCentred(context, getPreloadedImage(layer.path), 0, scale);

      return;
    }

    if (layer.type === 'city') {
      // As the map does (`Cities`): the civilization's first colour behind the city, inset as the tileset says, and
      //  the city's colour keys swapped for the ones the tileset names. Only colour keys can be drawn yet (#152).
      const { sprite, inset, colouring } = currentTileset().cities,
        replaceKeys = colouring as Extract<
          Colouring,
          { mode: 'replaceColours' }
        >,
        colours = layer.colours ?? [],
        [background] = colours;

      if (background) {
        context.fillStyle = background;
        context.fillRect(
          inset,
          inset,
          iconSize - inset * 2,
          iconSize - inset * 2
        );
      }

      const city = getPreloadedImage(sprite),
        // Recoloured only when the civilization has every colour the keys take.
        replacements = replacementColours(replaceKeys, colours);

      if (isDrawable(city)) {
        context.drawImage(
          replacements.every(Boolean)
            ? replaceColours(city, replaceKeys.keys, replacements)
            : city,
          inset,
          inset
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
      }),
      offset,
      scale
    );

    if (layer.status) {
      drawMark(context, layer.status);
    }
  });
};
