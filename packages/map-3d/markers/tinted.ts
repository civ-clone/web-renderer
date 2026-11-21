// A model's material in its owner's colour (docs/3d-renderer.md §10): where its texture's alpha says, as a set of
//  models paints the parts a player's colour shows on, the colour's mixed in, `rgb × mix(tint, white, alpha)`, and the
//  alpha's left out of how solid it is. A class of its own, so a marker faded (`fade`), which draws with a clone of
//  the kit's material, is tinted as the kit's is.

import {
  Color,
  MeshStandardMaterial,
  MeshStandardMaterialParameters,
  WebGLProgramParametersWithUniforms,
} from 'three';

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
