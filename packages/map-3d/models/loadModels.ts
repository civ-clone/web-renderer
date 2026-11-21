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
import { LoadingManager } from 'three';
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
 * Whether `data` is a glTF binary whole in itself: nothing in it read from elsewhere (a `uri`, anywhere in it), which
 *  loading it would fetch; its buffers and images lists, as glTF has them; and needing no extension, which might.
 */
export const selfContained = (data: ArrayBuffer): boolean => {
  if (data.byteLength < 20) {
    return false;
  }

  const view = new DataView(data),
    length = view.getUint32(12, true);

  // `glTF`, version 2, and a JSON chunk first, as a glTF binary is.
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(16, true) !== 0x4e4f534a ||
    20 + length > data.byteLength
  ) {
    return false;
  }

  try {
    const json = JSON.parse(
        new TextDecoder().decode(new Uint8Array(data, 20, length))
      ),
      // Whether there's a `uri` anywhere in `value`.
      reads = (value: unknown): boolean =>
        Array.isArray(value)
          ? value.some(reads)
          : typeof value === 'object' &&
            value !== null &&
            (Object.prototype.hasOwnProperty.call(value, 'uri') ||
              Object.values(value).some(reads)),
      listed = (value: unknown): boolean =>
        value === undefined || Array.isArray(value);

    return (
      typeof json === 'object' &&
      json !== null &&
      !Array.isArray(json) &&
      listed(json.buffers) &&
      listed(json.images) &&
      json.extensionsUsed === undefined &&
      json.extensionsRequired === undefined &&
      !reads(json)
    );
  } catch {
    return false;
  }
};

/**
 * What a model's loaded with: anything it would fetch but what's in the file itself (a `blob:` or `data:` address, as
 *  three.js reads its images from), it's refused, whatever the file said.
 */
export const modelManager = (): LoadingManager => {
  const manager = new LoadingManager();

  manager.setURLModifier((url: string): string => {
    if (!/^(?:blob|data):/i.test(url)) {
      throw new Error(`${url}: a model reads nothing from elsewhere`);
    }

    return url;
  });

  return manager;
};

/** `url` read against `here`, if it's on the same site as `here`: or nothing, for another site's. */
export const onSite = (url: string, here: string): string | null => {
  try {
    const read = new URL(url, here);

    return read.origin === new URL(here).origin ? read.href : null;
  } catch {
    return null;
  }
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
  // Only this site's, the manifest and its models: whatever asked for it, nothing's fetched from another.
  const at = onSite(url, location.href);

  if (at === null) {
    throw new Error(`${url}: not on this site`);
  }

  // Nor sent on to another by the site.
  const response = await fetch(at, { redirect: 'error' });

  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }

  const manifest = readModelManifest(await response.json());

  if (typeof manifest === 'string') {
    throw new Error(`${url}: ${manifest}`);
  }

  const loader = new GLTFLoader(modelManager()),
    types = unitTypesOf(manifest),
    // Where the manifest is: each model's beside it.
    beside = new URL('.', at).href;

  await Promise.all(
    [...types.keys()].map(async (id) => {
      try {
        const file = onSite(manifest.models[id]!.file, at);

        if (file === null || !file.startsWith(beside)) {
          throw new Error(
            `${manifest.models[id]!.file}: not beside the manifest`
          );
        }

        const got = await fetch(file, { redirect: 'error' });

        if (!got.ok) {
          throw new Error(`${file}: ${got.status}`);
        }

        // A glTF binary, whole in itself: nothing more is fetched for it.
        const data = await got.arrayBuffer();

        if (!selfContained(data)) {
          throw new Error(`${file}: not a glTF binary whole in itself`);
        }

        const gltf = await loader.parseAsync(data, '');

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
