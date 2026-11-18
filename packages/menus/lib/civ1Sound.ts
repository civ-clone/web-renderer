import {
  Asset,
  SOUND_DRIVER,
  assetStore,
} from '@civ-clone/ui-assets/AssetStore';
import {
  ChosenFile,
  FilesWanted,
  PackImport,
  PackImportResult,
  registerPackImport,
  unsupportedFile,
} from '@civ-clone/ui-assets/lib/packImports';
import {
  readSoundDescriptor,
  registerSoundSet,
  soundFileKey,
} from '@civ-clone/ui-assets/sounds/SoundDescriptor';
import CvlImage from '@civ-clone/ui-audio/cvl/Image';
import civ1Adlib from './civ1-adlib.json';
import { t } from 'i18next';

// Civilization's music (#126), as a set in the library (#1063): the AdLib sound driver, ASOUND.CVL, from the player's
//  own copy, kept as the file it is rather than cut up, under the key it has always had (`soundDriverKey`), which the
//  music reads. Registered here, where the library is, as the audio package that reads the file doesn't use the store.

/** The sound set's manifest. */
export const civ1Sound = registerSoundSet(readSoundDescriptor(civ1Adlib));

const soundFile = 'ASOUND.CVL';

/**
 * The key ASOUND.CVL is kept under, from the manifest's `storage` (#1106). The store reads the driver by its own name
 *  for the key (`SOUND_DRIVER`), as the assets package can't read the menus' manifest, so the two are checked to agree
 *  as this loads: a manifest changed alone would otherwise keep the file where the music never looks.
 */
export const soundDriverKey = soundFileKey(civ1Sound, soundFile);

if (soundDriverKey !== SOUND_DRIVER) {
  throw new Error(
    `The music's manifest keeps ${soundFile} under ${soundDriverKey}, but the music reads it from ${SOUND_DRIVER}.`
  );
}

/** Whether `file` is Civilization's sound driver, whatever the case of its name. */
export const isSoundFile = ({ name }: ChosenFile): boolean =>
  name.toUpperCase() === soundFile;

/**
 * ASOUND.CVL as a record to store, once `cvl/Image` has read it as the AdLib driver (#126). Rejects, naming the file,
 *  when it isn't the driver.
 */
const soundAsset = async (file: File): Promise<Asset> => {
  let bytes: ArrayBuffer;

  try {
    bytes = await file.arrayBuffer();
    new CvlImage(bytes);
  } catch (cause) {
    throw unsupportedFile(
      file.name,
      `${file.name} is not the AdLib sound driver`,
      cause
    );
  }

  return {
    // The key the music has always read it from: the set's storage, with the file's own name.
    name: soundDriverKey,
    blob: new Blob([bytes], { type: 'application/octet-stream' }),
  };
};

/** The sound set's import: ASOUND.CVL, which can be added on its own once Civilization's sprites are in. */
export const civ1SoundImport: PackImport = {
  id: civ1Sound.id,
  name: civ1Sound.name,
  game: (): string => t('Civ1Sound.game'),
  requiredFiles: [soundFile],
  optionalFiles: [],
  // Kept whole, as the file it is: nothing is left as it was.
  replacesAll: true,
  accepts: isSoundFile,
  instructions: (): string => t('Civ1Sound.import', { file: soundFile }),
  import: async (files: File[]): Promise<PackImportResult> => ({
    assets: await Promise.all(files.filter(isSoundFile).map(soundAsset)),
  }),
  ready: (): Promise<boolean> =>
    assetStore.hasSoundDriver().catch((): boolean => false),
  // One file: it's either stored, and nothing is wanted, or it isn't, and none of the set is.
  filesWanted: async (): Promise<FilesWanted | null> =>
    (await civ1SoundImport.ready()) ? { required: [], optional: [] } : null,
};

registerPackImport(civ1SoundImport);

export default civ1SoundImport;
