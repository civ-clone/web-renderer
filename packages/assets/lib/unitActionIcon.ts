import { Tile, Unit, UnitAction } from '@civ-clone/ui-protocol/types';
import getPreloadedImage from './getPreloadedImage';
import { imageSize, isDrawable } from './imageSize';
import { Colouring, TilesetDescriptor } from '../tilesets/TilesetDescriptor';
import { interfaceArt, interfaceSpriteName } from './interfaceArt';
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
  tileset: TilesetDescriptor = interfaceArt()
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
          if (data[(y * width + x) * 4 + 3]! > 0) {
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
  scale = 1,
  pictureSize = iconSize
): void => {
  if (!isDrawable(image)) {
    return;
  }

  const [left, top, width, height] = drawnArea(image),
    centre = (start: number, size: number): number =>
      Math.round(((pictureSize - size) / 2 - start) * scale) / scale;

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

// The sprites' own tile, which may be larger than the picture (the pixel art's 32 px): the picture is fitted into it.
export const iconPictureSize = (
  tileset: TilesetDescriptor = interfaceArt()
): number => Math.max(iconSize, tileset.tile.width);

/**
 * How many pixels across an icon's canvas is drawn (#1118): a whole number of the sprites' own size, so each of their
 *  pixels is the same number of the canvas's, and never fewer than the screen shows it at (#352), so the marks are
 *  written at that size and no sprite pixel is dropped. Where that's more than the screen shows, the browser shrinks
 *  the whole drawing smoothly. A canvas not laid out yet is shown at the picture's own size.
 */
export const iconCanvasSize = (
  canvas: HTMLCanvasElement,
  tileset: TilesetDescriptor = interfaceArt()
): number => {
  const pictureSize = iconPictureSize(tileset),
    shown =
      (canvas.clientWidth || iconSize) * (globalThis.devicePixelRatio || 1);

  // Less a little, so a size that is already a whole number of sprites, give or take rounding, isn't taken up a step.
  return pictureSize * Math.max(1, Math.ceil(shown / pictureSize - 1e-6));
};

export const drawUnitActionIcon = (
  canvas: HTMLCanvasElement,
  layers: IconLayer[]
): void => {
  const context = canvas.getContext('2d');

  if (!context) {
    return;
  }

  // The interface's own art (#1063): a button's picture is the same whatever pack the map is drawn with.
  const tileset = interfaceArt(),
    size = iconCanvasSize(canvas, tileset),
    stacked = layers.filter((layer) => layer.type === 'unit').length > 1,
    pictureSize = iconPictureSize(tileset),
    // How many of the canvas's pixels make one of the picture's, for the marks; and one of the sprites', always whole.
    scale = size / iconSize,
    spriteScale = size / pictureSize,
    // Drawn in the sprites' own pixels; the sprites are enlarged pixel by pixel, and the marks written at full size,
    //  in the picture's.
    drawSprites = (): void =>
      context.setTransform(spriteScale, 0, 0, spriteScale, 0, 0),
    mark = (text: string): void => {
      context.setTransform(scale, 0, 0, scale, 0, 0);
      drawMark(context, text);
      drawSprites();
    };

  canvas.width = size;
  canvas.height = size;

  drawSprites();
  context.imageSmoothingEnabled = false;

  layers.forEach((layer, index) => {
    if (layer.type === 'image') {
      // An interface sprite (`city/trade`) by the art's own name for it; a map sprite (`terrain/land`) isn't in
      //  `names.ui`, so keeps its name.
      drawCentred(
        context,
        getPreloadedImage(interfaceSpriteName(layer.path, tileset), tileset),
        0,
        spriteScale,
        pictureSize
      );

      return;
    }

    if (layer.type === 'city') {
      // As the map does (`Cities`): the civilization's first colour behind the city, inset as the tileset says, and
      //  the city's colour keys swapped for the ones the tileset names: the interface's art, Civ1's, which boxes its
      //  cities.
      const { sprite, colouring } = tileset.cities,
        // Civ1's box city, whose inset is always given.
        inset = tileset.cities.inset!,
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
          pictureSize - inset * 2,
          pictureSize - inset * 2
        );
      }

      const city = getPreloadedImage(sprite, tileset),
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
        mark(layer.text);
      }

      return;
    }

    // Cargo is a stack, each unit a little further along than the last: two of the picture's pixels, in the sprites'
    //  own, so a larger tile's stack is spread as Civ1's is.
    const offset = stacked ? (index * 2 * pictureSize) / iconSize : 0;

    drawCentred(
      context,
      renderUnit(
        {
          _: layer.unit._,
          player: layer.unit.player,
          improvements: layer.fortified ? [{ _: 'Fortified' } as any] : [],
        },
        tileset
      ),
      offset,
      spriteScale,
      pictureSize
    );

    if (layer.status) {
      mark(layer.status);
    }
  });
};
