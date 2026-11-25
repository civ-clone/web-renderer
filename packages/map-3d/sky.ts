// The sky on the 3D map (docs/3d-renderer.md §9.3, plan 1.4): made by code, it lights the scene and gives reflections,
//  as an environment map.
//
// The camera never looks above the horizon: it's at least 25° down (`PITCH_MIN`), and sees 20° either side of where
//  it looks (`FIELD_OF_VIEW`), so past the land there's only the haze's colour. So the sky isn't drawn. What it does is
//  light everything from round about, as the hemisphere light did before it: pale from above, the haze's colour round
//  the horizon, the ground's brown from below, and a warm glow round the sun. And what's smooth or metal reflects it.
//
// It's a small picture of the sky all round (equirectangular, `skyTexture`), made from `skyColour`, which three.js
//  blurs for each roughness (`PMREMGenerator#fromEquirectangular`, in `stage.ts`).

import {
  Color,
  DataTexture,
  EquirectangularReflectionMapping,
  FloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  RGBAFormat,
} from 'three';

// The muted palette (D2): an overcast sky, lit by a sun low enough to model the relief. Its colours, as the page's
//  sRGB, worked in linear.
const ZENITH = new Color(0xd6e2ec),
  HORIZON = new Color(0x9fb3c4),
  GROUND = new Color(0x5b5140),
  SUN_GLOW = new Color(0xfff0d8);

/**
 * How bright the sky's light is (`Scene#environmentIntensity`): as bright as the hemisphere light it took the place of
 *  (the sky's pale and the ground's brown at 0.9), within a few hundredths, on whatever faces up, down or sideways.
 *  three.js lights what faces a hemisphere light's colour with a π-th of it, and what faces an environment's with all
 *  of it, so this is about 0.9 ÷ π, times how much lighter the pale is than the sky round the horizon.
 */
export const SKY_INTENSITY = 0.3;

/** How much of the sun's glow is round it, at its most: a soft brightening, not a disc. */
export const SUN_GLOW_STRENGTH = 0.35;

/**
 * The sky's colour, linear, seen the way (`x`, `y`, `z`) (up is `y`; it needn't be a unit long), with the sun the way
 *  `sun` (a unit long): from the haze's colour at the horizon to pale overhead; below it, soon the ground's brown; and
 *  round the sun, its glow.
 */
export const skyColour = (
  x: number,
  y: number,
  z: number,
  sun: readonly [number, number, number]
): [number, number, number] => {
  const length = Math.hypot(x, y, z) || 1,
    up = y / length,
    colour =
      up >= 0
        ? HORIZON.clone().lerp(ZENITH, Math.sqrt(up))
        : HORIZON.clone().lerp(GROUND, Math.min(1, -up * 8)),
    toSun = Math.max(0, (x * sun[0] + y * sun[1] + z * sun[2]) / length),
    // Only above the horizon: below it is the ground.
    glow = up > 0 ? toSun ** 16 * SUN_GLOW_STRENGTH : 0;

  colour.add(SUN_GLOW.clone().multiplyScalar(glow));

  return [colour.r, colour.g, colour.b];
};

/**
 * The sky all round, `width` across and `height` down, as three.js maps a picture onto the directions round about
 *  (equirectangular): across, the way round from +x towards +z; up the rows, from straight down to straight up.
 */
export const skyTexture = (
  sun: readonly [number, number, number],
  width = 64,
  height = 32
): DataTexture => {
  const data = new Float32Array(width * height * 4);

  for (let row = 0; row < height; row++) {
    const elevation = ((row + 0.5) / height - 0.5) * Math.PI;

    for (let column = 0; column < width; column++) {
      const round = ((column + 0.5) / width - 0.5) * Math.PI * 2,
        [r, g, b] = skyColour(
          Math.cos(round) * Math.cos(elevation),
          Math.sin(elevation),
          Math.sin(round) * Math.cos(elevation),
          sun
        );

      data.set([r, g, b, 1], (row * width + column) * 4);
    }
  }

  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);

  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = LinearSRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;

  return texture;
};
