// A model's material in its owner's colour (docs/3d-renderer.md §10): where its texture's alpha says, as a set of
//  models paints the parts a player's colour shows on, the colour's mixed in, `rgb × mix(tint, white, alpha)`, and the
//  alpha's left out of how solid it is. A class of its own, so a marker faded (`fade`), which draws with a clone of
//  the kit's material, is tinted as the kit's is. A colour too dark to show the model's shading under it is lightened
//  (`ownerTint`).

import {
  Color,
  MeshStandardMaterial,
  MeshStandardMaterialParameters,
  WebGLProgramParametersWithUniforms,
} from 'three';

/**
 * How light an owner's colour is at the least, painted on a model: its luminance, in linear light, about a sRGB grey of
 *  `#4f4f4f`. Under it, black and near-black wash out the model's shading where they're painted, leaving a flat
 *  silhouette.
 */
export const TINT_FLOOR = 0.08;

/**
 * The colour `colour` (a CSS colour) is painted on a model in: as it is, or, if it's darker than `TINT_FLOOR`, mixed
 *  with white just enough to reach it, so its hue's kept. The flag over the unit keeps the colour as it is.
 */
export const ownerTint = (colour: string): Color => {
  const tint = new Color(colour),
    luminance = 0.2126 * tint.r + 0.7152 * tint.g + 0.0722 * tint.b;

  if (luminance >= TINT_FLOOR) {
    return tint;
  }

  const towards = (TINT_FLOOR - luminance) / (1 - luminance);

  return tint.setRGB(
    tint.r + (1 - tint.r) * towards,
    tint.g + (1 - tint.g) * towards,
    tint.b + (1 - tint.b) * towards
  );
};

export class TintedMaterial extends MeshStandardMaterial {
  readonly isTintedMaterial = true;
  // The owner's colour, mixed in where the texture's alpha is less than solid.
  tint = new Color(1, 1, 1);

  constructor(
    parameters: MeshStandardMaterialParameters & { tint?: Color } = {}
  ) {
    const { tint, ...rest } = parameters;

    super(rest);

    if (tint !== undefined) {
      this.tint.copy(tint);
    }
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    shader.uniforms.tint = { value: this.tint };
    shader.fragmentShader = `uniform vec3 tint;\n${shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 texel = texture2D( map, vMapUv );
        diffuseColor.rgb *= texel.rgb * mix( tint, vec3( 1.0 ), texel.a );
      #endif`
    )}`;
  }

  override customProgramCacheKey(): string {
    return 'tinted';
  }

  override copy(source: TintedMaterial): this {
    super.copy(source);
    this.tint.copy(source.tint);

    return this;
  }
}

export default TintedMaterial;
