// A set of models for the 3D map (docs/3d-renderer.md §10): its manifest, as a hosted set's repository writes it, read
//  and checked here, and which model draws each unit type. Pure: loading the models is `loadModels.ts`'s.

import { PLANT_KINDS } from '@civ-clone/ui-models-builtin/vegetation';

/**
 * A licence, or a credit's, by name and link; and, where it asks for one (CC BY, CC BY-SA), the credit shown wherever
 *  the set's used (docs/asset-library.md, "The manifest").
 */
export type ModelLicence = { name: string; url: string; attribution?: string };

/** Whose work a set is made from, as everyone using it must say. */
export type ModelCredit = {
  work: string;
  author: string;
  url: string;
  licence: ModelLicence;
};

/**
 * What a unit's figures do, as a clip plays (plan 2.2): stand, walk, fight, fall, and the Settlers' work and settling.
 *  `idle`, `move` and `work` loop; the rest play once, `die` holding its last frame.
 */
export type ClipRole = 'idle' | 'move' | 'fight' | 'die' | 'work' | 'settle';

export const CLIP_ROLES: readonly ClipRole[] = [
  'idle',
  'move',
  'fight',
  'die',
  'work',
  'settle',
];

/**
 * What a shot is (`shots.ts`), as it's drawn and as quick as it flies: a bottle thrown, alight; an arrow; a bullet, a
 *  streak from a muzzle's flash; or a shell, a ball from a cannon's. A set says, as its model knows what it holds.
 */
export const SHOT_KINDS = ['bottle', 'arrow', 'bullet', 'shell'] as const;

export type ShotKind = (typeof SHOT_KINDS)[number];

/**
 * A shot leaving a figure as a clip plays: when, in seconds into it, from which of its joints, and what it is (a
 *  bottle, where it doesn't say, as the Partisans' first was).
 */
export type ClipShot = { at: number; joint: string; kind?: ShotKind };

/**
 * A model's rigged copy (plan 2.2): its file, beside the manifest, whose bind pose is the model's own, and the name in
 *  it of the clip each role plays; the shots each role's clip lets fly, which the map draws; and when, in seconds into
 *  its clip, a role's blow lands where it lets nothing fly, hand to hand (`strikes`).
 */
export type RiggedModel = {
  file: string;
  clips: { [role in ClipRole]?: string };
  shots?: { [role in ClipRole]?: ClipShot[] };
  strikes?: { [role in ClipRole]?: number };
};

/**
 * A model in a set: its file, beside the manifest, how big it's drawn, where that isn't the set's scale, and its
 *  rigged copy, where it has one.
 */
export type ModelEntry = { file: string; scale?: number; rigged?: RiggedModel };

export type ModelManifest = {
  schema: 1;
  kind: 'models';
  id: string;
  name: string;
  licence: ModelLicence;
  credits: ModelCredit[];
  // The 3D map's squares to each of the models' units.
  scale: number;
  models: { [id: string]: ModelEntry };
  // Which model draws each unit type, by the engine's name for it; and each plant, where it draws any, by the 3D map's
  //  kind of plant (`conifer`), or that kind on a terrain of its own (`Jungle:broadleaf`), by the engine's name for it.
  names: {
    unit: { [type: string]: string };
    plant?: { [plant: string]: string };
  };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';

const isScale = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isLicence = (value: unknown): value is ModelLicence =>
  isObject(value) &&
  isText(value.name) &&
  isText(value.url) &&
  (value.attribution === undefined || isText(value.attribution));

// A model's file: a glTF binary (whole in itself, reading no other file) beside the manifest, not reaching out of where
//  the set is, nor to another site: nothing a URL reads as other than it says (an escaped dot, a query, a fragment, a
//  space or a control character).
const isFile = (value: unknown): value is string =>
  isText(value) &&
  value.endsWith('.glb') &&
  !value.startsWith('/') &&
  !/[\\%?#\u0000-\u0020]/.test(value) &&
  !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
  value
    .split('/')
    .every((part) => part !== '' && part !== '.' && part !== '..');

// A plant as a set names it: a kind of plant the map grows (`conifer`), or that kind on a terrain of its own
//  (`Jungle:broadleaf`), its name letters only, as a rule set may name a terrain.
const isPlant = (value: string): boolean => {
  const match = /^(?:[A-Za-z]+:)?([A-Za-z]+)$/.exec(value);

  return (
    match !== null && (PLANT_KINDS as readonly string[]).includes(match[1]!)
  );
};

const isRole = (value: string): value is ClipRole =>
  (CLIP_ROLES as readonly string[]).includes(value);

const isShot = (value: unknown): value is ClipShot =>
  isObject(value) &&
  typeof value.at === 'number' &&
  Number.isFinite(value.at) &&
  value.at >= 0 &&
  isText(value.joint) &&
  (value.kind === undefined ||
    (SHOT_KINDS as readonly unknown[]).includes(value.kind));

// A rigged copy as a manifest gives it, as far as the map can play it: its file, as a model's is; the clip it names for
//  each role the map plays (any for another role, which a later map may play, left out); their shots, each when, from
//  which joint and what it is, of the kinds the map draws, in a role it names a clip for; and their strikes, each when,
//  in a role it names a clip for. Nothing, for one with no clip the map can play, or anything else wrong with it: its
//  model's drawn as it stands, and the rest of the set as it is.
const riggedOf = (value: unknown): RiggedModel | undefined => {
  if (!isObject(value) || !isFile(value.file) || !isObject(value.clips)) {
    return undefined;
  }

  const clips: RiggedModel['clips'] = {};

  Object.entries(value.clips).forEach(([role, name]) => {
    if (isRole(role) && isText(name)) {
      clips[role] = name;
    }
  });

  if (
    Object.keys(clips).length === 0 ||
    Object.entries(value.clips).some(
      ([role, name]) => isRole(role) && !isText(name)
    )
  ) {
    return undefined;
  }

  const shots = byRole(
      value.shots,
      clips,
      (each): each is ClipShot[] => Array.isArray(each) && each.every(isShot)
    ),
    strikes = byRole(
      value.strikes,
      clips,
      (each): each is number =>
        typeof each === 'number' && Number.isFinite(each) && each >= 0
    );

  if (shots === null || strikes === null) {
    return undefined;
  }

  return {
    file: value.file,
    clips,
    ...(shots === undefined ? {} : { shots }),
    ...(strikes === undefined ? {} : { strikes }),
  };
};

// What a rigged copy gives for each role (`value`), each as `valid` says, in a role it names a clip for (any for a
//  role the map doesn't play left out): none where it gives nothing; or `null`, where anything's wrong with it.
const byRole = <T>(
  value: unknown,
  clips: RiggedModel['clips'],
  valid: (each: unknown) => each is T
): { [role in ClipRole]?: T } | undefined | null => {
  if (value === undefined) {
    return undefined;
  }

  if (!isObject(value)) {
    return null;
  }

  const given: { [role in ClipRole]?: T } = {},
    played = Object.entries(value).filter(([role]) => isRole(role));

  if (
    !played.every(
      ([role, each]) => clips[role as ClipRole] !== undefined && valid(each)
    )
  ) {
    return null;
  }

  played.forEach(([role, each]) => (given[role as ClipRole] = each as T));

  return given;
};

/**
 * `json` as a set of models' manifest, or what's wrong with it: a set must say its licence and credit whose work it's
 *  made from, as it's shown to players, and each unit type it draws must be drawn by one of its models.
 */
export const readModelManifest = (json: unknown): ModelManifest | string => {
  if (!isObject(json)) {
    return 'not an object';
  }

  if (json.schema !== 1 || json.kind !== 'models') {
    return 'not a set of models (schema 1)';
  }

  if (!isText(json.id) || !isText(json.name)) {
    return 'no id or name';
  }

  if (!isLicence(json.licence)) {
    return 'no licence';
  }

  if (
    !Array.isArray(json.credits) ||
    json.credits.length === 0 ||
    !json.credits.every(
      (credit) =>
        isObject(credit) &&
        isText(credit.work) &&
        isText(credit.author) &&
        isText(credit.url) &&
        isLicence(credit.licence)
    )
  ) {
    return 'no credits';
  }

  if (!isScale(json.scale)) {
    return 'no scale';
  }

  const models = json.models;

  if (!isObject(models)) {
    return 'no models';
  }

  const bad = Object.entries(models).find(
    ([, entry]) =>
      !isObject(entry) ||
      !isFile(entry.file) ||
      (entry.scale !== undefined && !isScale(entry.scale))
  );

  if (bad !== undefined) {
    return `model ${bad[0]}: no glTF binary beside the manifest, or no scale`;
  }

  const names = json.names;

  if (!isObject(names) || !isObject(names.unit)) {
    return 'no unit names';
  }

  const unknown = Object.entries(names.unit).find(
    ([, id]) => !isText(id) || !Object.prototype.hasOwnProperty.call(models, id)
  );

  if (unknown !== undefined) {
    return `unit ${unknown[0]}: drawn by a model the set hasn't`;
  }

  if (names.plant !== undefined && !isObject(names.plant)) {
    return 'plant names not a list of plants';
  }

  const unplanted = Object.entries(names.plant ?? {}).find(
    ([plant, id]) =>
      !isPlant(plant) ||
      !isText(id) ||
      !Object.prototype.hasOwnProperty.call(models, id)
  );

  if (unplanted !== undefined) {
    return `plant ${unplanted[0]}: not a kind of plant, or drawn by a model the set hasn't`;
  }

  // Each model with its rigged copy as far as the map can play it, or none.
  return {
    ...json,
    models: Object.fromEntries(
      Object.entries(models).map(([id, entry]) => {
        const { rigged, ...model } = entry as Record<string, unknown>,
          playable = riggedOf(rigged);

        return [
          id,
          playable === undefined ? model : { ...model, rigged: playable },
        ];
      })
    ),
  } as unknown as ModelManifest;
};

/** The unit types each of `manifest`'s models draws, by the model. */
export const unitTypesOf = (manifest: ModelManifest): Map<string, string[]> => {
  const types = new Map<string, string[]>();

  Object.entries(manifest.names.unit).forEach(([type, id]) =>
    types.set(id, [...(types.get(id) ?? []), type])
  );

  return types;
};

/** The plants each of `manifest`'s models draws, by the model: none, for a set that names none. */
export const plantsOf = (manifest: ModelManifest): Map<string, string[]> => {
  const plants = new Map<string, string[]>();

  Object.entries(manifest.names.plant ?? {}).forEach(([plant, id]) =>
    plants.set(id, [...(plants.get(id) ?? []), plant])
  );

  return plants;
};

/** How big `id` is drawn: the 3D map's squares to each of its units. */
export const scaleOf = (manifest: ModelManifest, id: string): number =>
  manifest.models[id]?.scale ?? manifest.scale;
