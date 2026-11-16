// The title and body of the window that asks the player to choose from a list the engine sends. Kept free of DOM
//  imports so it can be tested in Node.

import { t } from 'i18next';

// A key with no title of its own gets the default title, not the default body (#268).
export const chooseFromListTitle = (key: string, data: unknown): string =>
  t(`ChooseFromList.${key}.title`, {
    data,
    defaultValue: t('ChooseFromList.default.title'),
  });

export const chooseFromListBody = (key: string, data: unknown): string =>
  t(`ChooseFromList.${key}.body`, {
    data,
    defaultValue: t('ChooseFromList.default.body'),
  });

// A choice with no label of its own shows its class name. A choice that is a plain value, such as the yes or no of
//  Civ2's Palace escape (M2c, `capture-city.palace-escape`), has a label for each value, and shows the value without.
export const chooseFromListChoice = (key: string, value: unknown): string =>
  typeof value === 'object' && value !== null
    ? t(`ChooseFromList.${key}.choice`, {
        value,
        defaultValue: (value as { _?: string })._,
      })
    : t(`ChooseFromList.${key}.choice.${String(value)}`, {
        defaultValue: String(value),
      });
