// Loading a set of models for the 3D map (docs/3d-renderer.md §10): its manifest, read and checked (`modelSet.ts`), and
//  then each model that draws a unit type, as glTF binaries beside it, each told of as it arrives. What's drawn of a
//  model is what its file's meshes are: each a geometry and a texture, in its owner's colour where it says
//  (`extras.playerColour`, the texture's alpha the mask), or cut out by its alpha (see-through).

import {
  BufferGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  ModelManifest,
  readModelManifest,
  scaleOf,
  unitTypesOf,
} from './modelSet';

/** A part of a model: what it's made of, its texture, and how it's coloured. */
export type ModelPart = {
  geometry: BufferGeometry;
  map: Texture | null;
  // In its owner's colour, where its texture's alpha says.
  tinted: boolean;
  // Cut out where its texture's alpha is under a half, both sides drawn.
  cutout: boolean;
};

/** A model as it's drawn: its parts, in its own units, and the 3D map's squares to each. */
export type LoadedModel = {
  parts: ModelPart[];
  scale: number;
};

/** What's had from a model's file: its meshes' parts. */
export const partsOf = (scene: {
  updateMatrixWorld(force?: boolean): void;
  traverse(each: (object: unknown) => void): void;
}): ModelPart[] => {
  const parts: ModelPart[] = [];

  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    const mesh = object as Mesh;

    if (!mesh.isMesh) {
      return;
    }

    const materials: Material[] = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    // A mesh with one material each, as the set's converter writes them.
    materials.slice(0, 1).forEach((material) => {
      const standard = material as MeshStandardMaterial,
        geometry = mesh.geometry.clone();

      geometry.applyMatrix4(mesh.matrixWorld);
      geometry.computeBoundingBox();
      parts.push({
        geometry,
        map: standard.map ?? null,
        tinted: standard.userData?.playerColour === true,
        cutout: standard.alphaTest > 0,
      });
    });
  });

  return parts;
};

/**
 * Loads the set whose manifest is at `url`: its manifest, then each model that draws a unit type, each given to
 *  `loaded` as it arrives, with the unit types it draws. Resolves with the manifest once all have been tried, or
 *  rejects saying why there's none (it can't be fetched, or isn't a set of models). A model that can't be had is said
 *  in `failed`, and the rest go on.
 */
export const loadModels = async (
  url: string,
  loaded: (id: string, model: LoadedModel, types: readonly string[]) => void,
  failed: (id: string, error: unknown) => void
): Promise<ModelManifest> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }

  const manifest = readModelManifest(await response.json());

  if (typeof manifest === 'string') {
    throw new Error(`${url}: ${manifest}`);
  }

  const loader = new GLTFLoader(),
    types = unitTypesOf(manifest);

  await Promise.all(
    [...types.keys()].map(async (id) => {
      try {
        const file = new URL(
            manifest.models[id]!.file,
            new URL(url, location.href)
          ).href,
          gltf = await loader.loadAsync(file);

        loaded(
          id,
          { parts: partsOf(gltf.scene), scale: scaleOf(manifest, id) },
          types.get(id) ?? []
        );
      } catch (error) {
        failed(id, error);
      }
    })
  );

  return manifest;
};
