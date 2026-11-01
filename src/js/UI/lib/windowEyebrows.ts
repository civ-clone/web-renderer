import { t } from 'i18next';

// The line over a window's title in the new chrome (#738): what kind of window it is, and the key that opens it. Kept
//  here, by each window's class, so the windows themselves don't change before the switch-over (#735).
const eyebrows: { [windowClass: string]: [kind: string, key: string | null] } =
  {
    'city-status': ['report', 'F1'],
    'military-report': ['report', 'F2'],
    'intelligence-report': ['report', 'F3'],
    'happiness-report': ['report', 'F4'],
    'trade-report': ['report', 'F5'],
    'science-report': ['report', 'F6'],
    'top-cities-report': ['report', 'F8'],
    'civilization-score-report': ['report', 'F9'],
    civilopedia: ['reference', null],
    'city-build': ['production', null],
  };

/** The eyebrow for a window with these classes, or `null` for one without. */
export const eyebrowFor = (classes: string[]): string | null => {
  const found = classes.find((name) => name in eyebrows);

  if (found === undefined) {
    return null;
  }

  const [kind, key] = eyebrows[found];

  return t(`Window.Eyebrow.${kind}`, {
    key,
    context: key === null ? undefined : 'key',
  });
};

export default eyebrowFor;
