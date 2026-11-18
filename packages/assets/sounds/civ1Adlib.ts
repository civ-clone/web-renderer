import json from './civ1-adlib.json';
import readSoundDescriptor from './SoundDescriptor';

// Civilization's music's manifest (#126, #1063), kept here rather than with its import in the menus, so the store takes
//  the key it reads the driver by from the manifest's `storage` too (`SOUND_DRIVER`, #1106). The library registers it.

/** The manifest of Civilization's AdLib music, as `sound.schema.json` accepts it. */
export const civ1Adlib = readSoundDescriptor(json);

export default civ1Adlib;
