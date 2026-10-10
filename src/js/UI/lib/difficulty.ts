// The difficulty levels the new game menu offers, and the one it offers first. Kept free of DOM imports so it can be
//  tested in Node.

import { DifficultyOption } from '../../Engine/Requests/Difficulties';
import { t } from 'i18next';

export type DifficultyStorage = Pick<Storage, 'getItem' | 'setItem'>;

const storageKey = 'civ.difficulty';

// Offered first when the player has never chosen, or the level they chose isn't offered.
export const defaultDifficulty = 'Prince';

const browserStorage = (): DifficultyStorage | null =>
  globalThis.localStorage ?? null;

/**
 * The level to preselect: the last one the player chose in this browser (#173), or Prince. It's a convenience, so
 * storage that is blocked or unreadable just means the default.
 */
export const preselectedDifficulty = (
  options: DifficultyOption[],
  storage: () => DifficultyStorage | null = browserStorage
): string => {
  let stored: string | null = null;

  try {
    stored = storage()?.getItem(storageKey) ?? null;
  } catch {
    stored = null;
  }

  const names = options.map(({ name }) => name);

  if (stored !== null && names.includes(stored)) {
    return stored;
  }

  return names.includes(defaultDifficulty)
    ? defaultDifficulty
    : names[Math.floor(names.length / 2)] ?? defaultDifficulty;
};

export const rememberDifficulty = (
  name: string,
  storage: () => DifficultyStorage | null = browserStorage
): void => {
  try {
    storage()?.setItem(storageKey, name);
  } catch {
    // Storage is blocked or full: the next game offers the default instead.
  }
};

export const difficultyName = (name: string): string =>
  t(`${name}.name`, { defaultValue: name, ns: 'difficulty' });

/** Each level's label, easiest first, with the easiest and the toughest marked as Civ1 marks them. */
export const difficultyLabels = (
  options: DifficultyOption[]
): { label: string; value: string }[] => {
  const sorted = [...options].sort((a, b) => a.level - b.level);

  return sorted.map(({ name }, index) => ({
    label: t('DifficultyWindow.level', {
      level: difficultyName(name),
      context:
        sorted.length < 2
          ? undefined
          : index === 0
          ? 'easiest'
          : index === sorted.length - 1
          ? 'toughest'
          : undefined,
    }),
    value: name,
  }));
};
