// A set of models for the 3D map (docs/3d-renderer.md §10): its manifest, as a hosted set's repository writes it, read
//  and checked here, and which model draws each unit type. Pure: loading the models is `loadModels.ts`'s.

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

/** A model in a set: its file, beside the manifest, and how big it's drawn, where that isn't the set's scale. */
export type ModelEntry = { file: string; scale?: number };

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
  // Which model draws each unit type, by the engine's name for it.
  names: { unit: { [type: string]: string } };
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

  return json as unknown as ModelManifest;
};

/** The unit types each of `manifest`'s models draws, by the model. */
export const unitTypesOf = (manifest: ModelManifest): Map<string, string[]> => {
  const types = new Map<string, string[]>();

  Object.entries(manifest.names.unit).forEach(([type, id]) =>
    types.set(id, [...(types.get(id) ?? []), type])
  );

  return types;
};

/** How big `id` is drawn: the 3D map's squares to each of its units. */
export const scaleOf = (manifest: ModelManifest, id: string): number =>
  manifest.models[id]?.scale ?? manifest.scale;
