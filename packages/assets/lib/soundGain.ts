import { instance as options } from '@civ-clone/ui-platform/GameOptionsRegistry';

/** The `sound` and `soundVolume` options as an output gain (#126): off is 0, and the volume's square, as loudness goes. */
export const soundGain = (
  on: unknown = options.get('sound', true),
  volume: unknown = options.get('soundVolume', 70)
): number => {
  const level = typeof volume === 'number' ? volume : 0;

  return on === true ? (Math.min(100, Math.max(0, level)) / 100) ** 2 : 0;
};

// Told when either option changes (Options does), for the music to follow: so Options needn't import the player,
//  and with it the build's own files.
const listeners = new Set<() => void>();

/** Calls `listener` whenever the sound options change; returns its removal. */
export const onSoundChanged = (listener: () => void): (() => void) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};

/** Says the sound options have changed. */
export const soundChanged = (): void =>
  listeners.forEach((listener) => listener());

export default soundGain;
