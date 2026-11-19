/**
 * A number in [0, 1) fixed by a square's position (`x`, `y`) and a `seed`, the same every time the square is drawn and
 *  in every game: what picks a terrain's other pictures (`families.terrain.variants`, `flavour`), so they don't change
 *  as the map is redrawn or scrolled.
 */
export const squareHash = (x: number, y: number, seed: number = 0): number => {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(seed | 0, 2147483647);

  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);

  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

export default squareHash;
