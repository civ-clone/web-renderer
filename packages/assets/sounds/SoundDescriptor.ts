import { SetLicence, SetSource } from '../tilesets/TilesetDescriptor';
import firstFailure, { pathName } from '../lib/jsonSchema';
import schema from './sound.schema.json';

// What a set of sound says about itself in the library (#1063): the head a tileset descriptor has, with no descriptor
//  body, so it has a schema (`sound.schema.json`) and a reader of its own. Civilization's AdLib driver is one, which
//  the music plays with.

export interface SoundDescriptor {
  schema: 1;
  kind: 'sound';
  id: string;
  name: string;
  source: SetSource;
  licence?: SetLicence;
  /** Where its files are kept: a file's key in the store is `prefix + name + ext`. */
  storage: { prefix: string; ext: string };
}

/** `json` as a sound set's manifest, one `sound.schema.json` accepts. Throws an `Error` saying what is wrong otherwise. */
export const readSoundDescriptor = (json: unknown): SoundDescriptor => {
  const failure = firstFailure(schema, json);

  if (failure !== null) {
    const { path, value, keyword, message } = failure;

    throw new Error(
      `Sound set: ${(
        message ?? '{path} is not what a sound set has there ({keyword}).'
      ).replace(/\{(path|value|keyword)\}/g, (_, token: string) =>
        token === 'path'
          ? pathName(path)
          : token === 'value'
          ? JSON.stringify(value)
          : keyword
      )}`
    );
  }

  return json as SoundDescriptor;
};

const registered: SoundDescriptor[] = [];

/** Lists `sound` in the library (#1063): its package calls this as it is loaded. Throws for a second with its id. */
export const registerSoundSet = (sound: SoundDescriptor): SoundDescriptor => {
  if (registered.some(({ id }) => id === sound.id)) {
    throw new Error(`Sound set "${sound.id}" is registered already.`);
  }

  registered.push(sound);

  return sound;
};

/** Every sound set registered, as they were registered. */
export const soundSets = (): SoundDescriptor[] => [...registered];

export default readSoundDescriptor;
