// Loading a set of models for the 3D map (docs/3d-renderer.md §10): its manifest, read and checked (`modelSet.ts`), and
//  then each model that draws a unit type, as glTF binaries beside it, each told of as it arrives. What's drawn of a
//  model is what its file's meshes are: each a geometry and a texture, in its owner's colour where it says
//  (`extras.playerColour`, the texture's alpha the mask), or cut out by its alpha (see-through).

import {
  AnimationClip,
  BufferGeometry,
  DoubleSide,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PropertyBinding,
  Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LoadingManager } from 'three';
import {
  CLIP_ROLES,
  ClipRole,
  ClipShot,
  ModelManifest,
  RiggedModel,
  plantsOf,
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
  // Drawn from both sides, as its file's material says (glTF's `doubleSided`): a coat's single sheet seen from inside.
  doubleSided: boolean;
};

/** A model as it's drawn: its parts, in its own units, and the 3D map's squares to each. */
export type LoadedModel = {
  parts: ModelPart[];
  scale: number;
};

/**
 * A model's rigged copy (plan 2.2), as its figures are drawn while a clip plays: its file's scene, posed as the model
 *  stands, each mesh a part as `partsOf` would take it (`rigPart`); the clip each role plays, of those its file has;
 *  the shots each lets fly; and the 3D map's squares to each of its units, as the model's.
 */
export type LoadedRig = {
  scene: Object3D;
  clips: Map<ClipRole, AnimationClip>;
  shots: Map<ClipRole, ClipShot[]>;
  scale: number;
};

/** What's drawn of a mesh of a rigged copy's, as `partsOf` takes a model's: its texture, and how it's coloured. */
export const rigPart = (mesh: Mesh): Omit<ModelPart, 'geometry'> =>
  partOf(
    mesh.geometry,
    (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)!
  );

// A mesh's geometry drawn with `material`, as a part of a model.
const partOf = (geometry: BufferGeometry, material: Material): ModelPart => {
  const standard = material as MeshStandardMaterial;

  return {
    geometry,
    map: standard.map ?? null,
    tinted: standard.userData?.playerColour === true,
    cutout: standard.alphaTest > 0,
    doubleSided: standard.side === DoubleSide,
  };
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
      const geometry = mesh.geometry.clone();

      geometry.applyMatrix4(mesh.matrixWorld);
      geometry.computeBoundingBox();
      parts.push(partOf(geometry, material));
    });
  });

  return parts;
};

/**
 * The clip each role plays of those a rigged copy's file has (`animations`, its scene `scene`), as its manifest names
 *  them (`rigged`), and the shots each lets fly. Throws, saying why, for a clip its file hasn't, or one with a track
 *  moving a node it can't find by name, as each figure's copy of the scene finds it: GLTFLoader names a track moving a
 *  node with no name by its uuid, which would move nothing on a copy.
 */
export const clipsOf = (
  { animations, scene }: { animations: AnimationClip[]; scene: Object3D },
  rigged: RiggedModel
): {
  clips: Map<ClipRole, AnimationClip>;
  shots: Map<ClipRole, ClipShot[]>;
} => {
  const clips = new Map<ClipRole, AnimationClip>(),
    shots = new Map<ClipRole, ClipShot[]>();

  CLIP_ROLES.forEach((role) => {
    const name = rigged.clips[role];

    if (name === undefined) {
      return;
    }

    const clip = animations.find((each) => each.name === name);

    if (clip === undefined) {
      throw new Error(`${rigged.file}: no clip ${name}`);
    }

    const lost = clip.tracks.find(
      ({ name: track }) =>
        scene.getObjectByName(
          PropertyBinding.parseTrackName(track).nodeName
        ) === undefined
    );

    if (lost !== undefined) {
      throw new Error(
        `${rigged.file}: clip ${name} moves a node it can't name (${lost.name})`
      );
    }

    // Named as the file has them, and found as three.js names them, as a clip's tracks are.
    const fired = (rigged.shots?.[role] ?? []).map((shot) => ({
        ...shot,
        joint: PropertyBinding.sanitizeNodeName(shot.joint),
      })),
      nowhere = fired.find(
        ({ joint }) => scene.getObjectByName(joint) === undefined
      );

    if (nowhere !== undefined) {
      throw new Error(
        `${rigged.file}: clip ${name} shoots from a node it hasn't (${nowhere.joint})`
      );
    }

    clips.set(role, clip);
    shots.set(role, fired);
  });

  return { clips, shots };
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

  // `glTF`, version 2, as long as it says, and a JSON chunk first, as a glTF binary is.
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== data.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a ||
    20 + length > data.byteLength
  ) {
    return false;
  }

  // Its chunks, read as three.js reads them, to its end: that JSON chunk and at most a binary one after it, ending at
  //  its end, so the JSON looked at here is the one it's loaded with.
  const kinds: number[] = [];

  for (let at = 12; at < data.byteLength; ) {
    if (at + 8 > data.byteLength) {
      return false;
    }

    const size = view.getUint32(at, true);

    kinds.push(view.getUint32(at + 4, true));
    at += 8 + size;

    if (at > data.byteLength) {
      return false;
    }
  }

  if (kinds.length > 2 || (kinds.length === 2 && kinds[1] !== 0x004e4942)) {
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
 * What a model's loaded with: anything it would fetch but what's in the file itself (a `blob:` address of this site's,
 *  `here`, or a `data:` one, as three.js reads its images from), it's refused, whatever the file said.
 */
export const modelManager = (here: string): LoadingManager => {
  const manager = new LoadingManager(),
    own = `blob:${here}/`;

  manager.setURLModifier((url: string): string => {
    if (!url.startsWith(own) && !/^data:/i.test(url)) {
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

/** The model `id` of the set whose manifest is at `url`, by a key of its own among every set's. */
export const modelKey = (url: string, id: string): string => `${url}#${id}`;

/**
 * Loads the set whose manifest is at `url`: its manifest, then each model that draws a unit type, each given to
 *  `loaded` as it arrives, with the unit types it draws; and then its rigged copy, where it has one, given to `rigged`.
 *  Each model that draws a plant (a tree) is given to `grown`, with the plants it draws. Resolves with the manifest
 *  once all have been tried, or rejects saying why there's none (it can't be fetched, or isn't a set of models). A
 *  model that can't be had is said in `failed`, and the rest go on.
 */
export const loadModels = async (
  url: string,
  loaded: (id: string, model: LoadedModel, types: readonly string[]) => void,
  failed: (id: string, error: unknown) => void,
  rigged: (
    id: string,
    rig: LoadedRig,
    types: readonly string[]
  ) => void = () => {},
  grown: (
    id: string,
    model: LoadedModel,
    plants: readonly string[]
  ) => void = () => {}
): Promise<ModelManifest> => {
  // Only this site's, the manifest and its models: whatever asked for it, nothing's fetched from another.
  const at = onSite(url, location.href);

  if (at === null) {
    throw new Error(`${url}: not on this site`);
  }

  // Nor sent on to another by the site.
  const response = await fetch(at, { redirect: 'error', credentials: 'omit' });

  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }

  const manifest = readModelManifest(await response.json());

  if (typeof manifest === 'string') {
    throw new Error(`${url}: ${manifest}`);
  }

  const loader = new GLTFLoader(modelManager(location.origin)),
    types = unitTypesOf(manifest),
    plants = plantsOf(manifest),
    // Where the manifest is: each model's beside it.
    beside = new URL('.', at).href;

  // A file the manifest names, as a model's is: on this site, beside the manifest, not sent on elsewhere, and a glTF
  //  binary whole in itself, parsed.
  const parsed = async (named: string) => {
    const file = onSite(named, at);

    if (file === null || !file.startsWith(beside)) {
      throw new Error(`${named}: not beside the manifest`);
    }

    const got = await fetch(file, {
      redirect: 'error',
      credentials: 'omit',
    });

    if (!got.ok) {
      throw new Error(`${file}: ${got.status}`);
    }

    // A glTF binary, whole in itself: nothing more is fetched for it.
    const data = await got.arrayBuffer();

    if (!selfContained(data)) {
      throw new Error(`${file}: not a glTF binary whole in itself`);
    }

    return loader.parseAsync(data, '');
  };

  await Promise.all(
    [...new Set([...types.keys(), ...plants.keys()])].map(async (id) => {
      const entry = manifest.models[id]!;

      try {
        const gltf = await parsed(entry.file),
          model = { parts: partsOf(gltf.scene), scale: scaleOf(manifest, id) };

        if (types.has(id)) {
          loaded(id, model, types.get(id)!);
        }

        if (plants.has(id)) {
          grown(id, model, plants.get(id)!);
        }
      } catch (error) {
        failed(id, error);

        return;
      }

      // Its rigged copy, once the model's drawing, where it has one: one that can't be had leaves the model as it is.
      if (entry.rigged === undefined || !types.has(id)) {
        return;
      }

      try {
        const gltf = await parsed(entry.rigged.file),
          { clips, shots } = clipsOf(gltf, entry.rigged);

        rigged(
          id,
          { scene: gltf.scene, clips, shots, scale: scaleOf(manifest, id) },
          types.get(id) ?? []
        );
      } catch (error) {
        failed(id, error);
      }
    })
  );

  return manifest;
};
