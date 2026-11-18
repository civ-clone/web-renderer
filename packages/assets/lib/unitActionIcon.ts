import { Tile, Unit, UnitAction } from '@civ-clone/ui-protocol/types';
import getPreloadedImage from './getPreloadedImage';
import { imageSize, isDrawable } from './imageSize';
import {
  Colouring,
  TilesetDescriptor,
  expandName,
} from '../tilesets/TilesetDescriptor';
import {
  gameInterfaceArt,
  hasInterfaceArt,
  interfaceArt,
  interfaceSprite,
  interfaceSpriteName,
} from './interfaceArt';
import citySprite from './citySprite';
import replaceColours from './replaceColours';
import renderUnit, { replacementColours } from './renderUnit';

// What a unit action's button shows (#348), as layers drawn one over another. `unitActionIconLayers` decides it from
//  the action alone, so it can be checked without a canvas; `drawUnitActionIcon` paints it.
export type IconLayer =
  // A sprite of the art the icons are drawn with (`terrain/land`), or, `interface`, one of the interface's own
  //  (`city/trade`), drawn from wherever the game's interface art takes it (`interfaceSprite`).
  | { type: 'image'; path: string; interface?: boolean }
  | { type: 'unit'; unit: Unit; fortified: boolean; status: string }
  | {
      type: 'city';
      text: string | null;
      colours: string[] | null;
      // Whose city, by civilization, for a tileset that draws each one's in its own style (Civ2's).
      civilization?: string;
    };

export const iconSize = 16;

/**
 * The art the order icons are drawn with (#1053): the game's own (`gameInterfaceArt`, Civ2's in a Civ2 game), whose
 *  units every unit there is has a sprite in, or else the theme's (`interfaceArt`), as every Civ1 game has.
 */
export const orderIconArt = (): TilesetDescriptor =>
  gameInterfaceArt() ?? interfaceArt();

const image = (path: string): IconLayer => ({ type: 'image', path });

// A square of `terrain`, as the map draws it (`Landscape`): the land beneath, a sprite per terrain or one under all of
//  it, and the terrain's own sprite over that unless the tileset draws none there, split so a layer can go between.
const ground = (
  tileset: TilesetDescriptor,
  terrain: string
): { base: IconLayer; over: IconLayer[] } => {
  const { base, terrain: family } = tileset.families,
    word = (name: string): string =>
      tileset.names.terrain[name] ?? name.toLowerCase(),
    under = base.under?.[terrain] ?? terrain,
    isolated =
      typeof family.isolated === 'string' &&
      !(family.skip ?? []).includes(terrain)
        ? expandName(family.isolated, { terrain: word(terrain) })
        : null;

  return {
    base: image(expandName(base.land, { terrain: word(under) })),
    over: isolated === null ? [] : [image(isolated)],
  };
};

// A neutral square for the improvements to be shown on, Grassland: nothing about the terrain they would really go on.
const square = (
  tileset: TilesetDescriptor,
  ...paths: string[]
): IconLayer[] => {
  const { base, over } = ground(tileset, 'Grassland');

  return [base, ...over, ...paths.map(image)];
};

// A road or railroad across the square, west to east, by the tileset's own names.
const across = (sprite: string): string[] =>
  ['w', 'e'].map((dir) => expandName(sprite, { dir }));

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
  tileset: TilesetDescriptor = orderIconArt()
): IconLayer[] => {
  const fallback = [unitLayer(unit, status)],
    { families } = tileset;

  switch (action._) {
    case 'Fortify':
      return [unitLayer(unit, status, true)];

    case 'FoundCity':
      return [
        {
          type: 'city',
          text: null,
          colours: civilizationColours(unit),
          civilization: unit.player?.civilization?._,
        },
      ];

    case 'JoinCity':
      return [
        {
          type: 'city',
          text: String((tile?.city?.growth.size ?? 0) + 1),
          colours: civilizationColours(unit),
          civilization: unit.player?.civilization?._,
        },
      ];

    case 'SetHomeCity':
      // The city, marked as the unit's own, so it isn't mistaken for No orders.
      return [
        {
          type: 'city',
          text: status,
          colours: civilizationColours(unit),
          civilization: unit.player?.civilization?._,
        },
      ];

    case 'ClearForest':
    case 'ClearJungle':
    case 'ClearSwamp':
    case 'PlantForest':
      // Sent by the engine, which is what knows what the action leaves.
      if (!action.result) {
        return fallback;
      }

      const { base, over } = ground(tileset, action.result);

      return [base, ...over];

    case 'BuildIrrigation': {
      // As the map draws it (`Landscape`): beneath the terrain, or over it when the tileset says so.
      const { sprite, overTerrain } = families.irrigation,
        irrigation = image(sprite),
        { base, over } = ground(tileset, 'Grassland');

      return [
        base,
        ...(overTerrain ? [...over, irrigation] : [irrigation, ...over]),
      ];
    }

    case 'BuildMine':
      return square(tileset, families.mine.sprite);

    case 'CleanPollution':
      return square(tileset, families.pollution.sprite);

    case 'BuildRoad':
    case 'RoadTo':
      return square(tileset, ...across(families.road.sprite));

    case 'BuildRailroad':
    case 'RailroadTo':
      return square(tileset, ...across(families.railroad.sprite));

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
      return [{ type: 'image', path: 'city/trade', interface: true }];

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

// Its drawing, what's drawn in it (`drawnArea`), enlarged or shrunk to fill most of the picture and centred: for a
//  tileset whose sprites leave much of their tile empty, as Civ2's units and cities do in its 64 px tiles, which would
//  otherwise be too small to make out on a button (#1053). Only for the game's own art: the theme's are drawn as ever.
const drawFilled = (
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  pictureSize: number,
  offset = 0
): void => {
  if (!isDrawable(image)) {
    return;
  }

  const [left, top, width, height] = drawnArea(image),
    fit = (pictureSize * 0.9) / Math.max(width, height, 1);

  context.save();
  context.translate(
    Math.round((pictureSize - width * fit) / 2) + offset,
    Math.round((pictureSize - height * fit) / 2) + offset
  );
  context.scale(fit, fit);
  context.drawImage(image, -left, -top);
  context.restore();
};

// Fitted into the middle of the picture: enlarged a whole number of times to most of it, or shrunk to fit it.
const drawFitted = (
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  pictureSize: number
): void => {
  if (!isDrawable(image)) {
    return;
  }

  const [width, height] = imageSize(image),
    largest = Math.max(width, height, 1),
    fit =
      largest <= pictureSize
        ? Math.max(1, Math.floor((pictureSize * 0.75) / largest))
        : pictureSize / largest;

  context.save();
  context.translate(
    Math.round((pictureSize - width * fit) / 2),
    Math.round((pictureSize - height * fit) / 2)
  );
  context.scale(fit, fit);
  context.drawImage(image, 0, 0);
  context.restore();
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
  tileset: TilesetDescriptor = orderIconArt()
): number => Math.max(iconSize, tileset.tile.width);

/**
 * How many pixels across an icon's canvas is drawn (#1118): a whole number of the sprites' own size, so each of their
 *  pixels is the same number of the canvas's, and never fewer than the screen shows it at (#352), so the marks are
 *  written at that size and no sprite pixel is dropped. Where that's more than the screen shows, the browser shrinks
 *  the whole drawing smoothly. A canvas not laid out yet is shown at the picture's own size.
 */
export const iconCanvasSize = (
  canvas: HTMLCanvasElement,
  tileset: TilesetDescriptor = orderIconArt()
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

  // The interface's own art (#1063), or the game's own (#1053): a button's picture is the same whatever pack the map
  //  is drawn with, unless the game's rule set brings art of its own (Civ2's).
  const tileset = orderIconArt(),
    size = iconCanvasSize(canvas, tileset),
    stacked = layers.filter((layer) => layer.type === 'unit').length > 1,
    // The game's own art (Civ2's) fills the picture with its units and cities, which leave much of its tiles empty.
    fills = !hasInterfaceArt(tileset),
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
      // One of the interface's sprites (`city/trade`), from wherever the game takes it (`interfaceSprite`), fitted into
      //  the picture; or a sprite of the art the icons are drawn with (`terrain/land`), by its own name.
      if (layer.interface) {
        const from = interfaceSprite(layer.path).tileset,
          picture = getPreloadedImage(
            interfaceSpriteName(layer.path, from),
            from
          );

        // The theme's own sprite, as it always was; another set's, enlarged a whole number of times to most of the
        //  picture, as a Civ2 icon is far smaller than its 64 px tile.
        if (from === tileset && hasInterfaceArt(tileset)) {
          drawCentred(context, picture, 0, spriteScale, pictureSize);
        } else {
          drawFitted(context, picture, pictureSize);
        }

        return;
      }

      const sprite = getPreloadedImage(layer.path, tileset);

      // The game's own art's map sprites (Civ2's terrain, roads and mines), each a whole tile, laid where the tile is in
      //  the middle of the picture, so a road's halves meet across it; the theme's centred by what's drawn, as ever.
      if (fills) {
        if (isDrawable(sprite)) {
          const [width, height] = imageSize(sprite);

          context.drawImage(
            sprite,
            Math.round((pictureSize - width) / 2),
            Math.round((pictureSize - height) / 2)
          );
        }

        return;
      }

      drawCentred(context, sprite, 0, spriteScale, pictureSize);

      return;
    }

    if (layer.type === 'city' && tileset.cities.mode === 'styles') {
      // A city of the civilization's own style, the smallest (Civ2's), as the map draws one without its flag.
      const city = getPreloadedImage(
        citySprite(tileset, {
          player: { civilization: { _: layer.civilization ?? '' } } as any,
          growth: { size: 1 } as any,
        }),
        tileset
      );

      if (fills) {
        drawFilled(context, city, pictureSize);
      } else {
        drawCentred(context, city, 0, spriteScale, pictureSize);
      }

      if (layer.text !== null) {
        mark(layer.text);
      }

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
    const offset = stacked ? (index * 2 * pictureSize) / iconSize : 0,
      unitPicture = renderUnit(
        {
          _: layer.unit._,
          player: layer.unit.player,
          improvements: layer.fortified ? [{ _: 'Fortified' } as any] : [],
        },
        tileset
      );

    if (fills) {
      drawFilled(context, unitPicture, pictureSize, offset);
    } else {
      drawCentred(context, unitPicture, offset, spriteScale, pictureSize);
    }

    if (layer.status) {
      mark(layer.status);
    }
  });
};
