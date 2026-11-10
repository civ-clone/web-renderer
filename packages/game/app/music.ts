import Music from '@civ-clone/ui-audio/Music';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import build from '@civ-clone/ui-client/lib/build';
import soundGain, { onSoundChanged } from '@civ-clone/ui-assets/lib/soundGain';

/**
 * Civilization's music from the player's ASOUND.CVL (#126), silent without one. The worklet's URL is the entry's, with
 *  the build on it, as the page's script and the game's worker have (#476).
 */
export const music = new Music({
  sound: () => assetStore.soundDriver(),
  gain: () => soundGain(),
  workletUrl: () => build.musicWorkletUrl,
});

onSoundChanged(() => music.volumeChanged());

export default music;
