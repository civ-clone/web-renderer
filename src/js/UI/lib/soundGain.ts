import { instance as options } from '../GameOptionsRegistry';

/** The `sound` and `soundVolume` options as an output gain (#126): off is 0, and the volume's square, as loudness goes. */
export const soundGain = (
  on: unknown = options.get('sound', true),
  volume: unknown = options.get('soundVolume', 70)
): number => {
  const level = typeof volume === 'number' ? volume : 0;

  return on === true ? (Math.min(100, Math.max(0, level)) / 100) ** 2 : 0;
};

export default soundGain;
