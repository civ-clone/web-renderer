// How well one colour reads on another, as WCAG 2 measures it, for text drawn on a canvas, where the stylesheet can't
//  choose (#747). Hex colours only, which is how civilizations' colours come; anything else can't be measured.

const channels = (colour: string): [number, number, number] | null => {
  const hex = colour.trim().replace(/^#/, ''),
    full =
      hex.length === 3
        ? hex
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : hex;

  if (!/^[0-9a-f]{6}$/i.test(full)) {
    return null;
  }

  return [0, 2, 4].map((index) =>
    parseInt(full.slice(index, index + 2), 16)
  ) as [number, number, number];
};

/** A colour's relative luminance, 0 for black to 1 for white, or `null` if it isn't a hex colour. */
export const luminance = (colour: string): number | null => {
  const rgb = channels(colour);

  if (rgb === null) {
    return null;
  }

  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The contrast between two colours, from 1 (none) to 21 (black on white), or `null` if either can't be measured. */
export const contrastRatio = (a: string, b: string): number | null => {
  const [first, second] = [luminance(a), luminance(b)];

  if (first === null || second === null) {
    return null;
  }

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

// What small text needs to read (WCAG 2, AA).
export const READABLE = 4.5;

/**
 * The colour to write on `background` with: `preferred` where it reads, otherwise whichever of `inks` reads best.
 *  `preferred` too where nothing can be measured.
 */
export const readableOn = (
  background: string,
  preferred: string,
  inks: string[]
): string => {
  const ratio = contrastRatio(background, preferred);

  if (ratio === null || ratio >= READABLE) {
    return preferred;
  }

  return inks.reduce(
    (best, ink) =>
      (contrastRatio(background, ink) ?? 0) >
      (contrastRatio(background, best) ?? 0)
        ? ink
        : best,
    preferred
  );
};

export default contrastRatio;
