import Music from '../../../src/js/Audio/Music';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import soundGain, { onSoundChanged } from '@civ-clone/ui-assets/lib/soundGain';
import { version } from '../../../build.json';

/**
 * Civilization's music from the player's ASOUND.CVL (#126), silent without one. The worklet has the build on its URL,
 *  as the page's script and the game's worker do (#476).
 */
export const music = new Music({
  sound: () => assetStore.soundDriver(),
  gain: () => soundGain(),
  workletUrl: `dist/musicWorklet.js?v=${encodeURIComponent(version)}`,
});

onSoundChanged(() => music.volumeChanged());

export default music;
