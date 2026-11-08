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

// A choice with no label of its own shows its class name.
export const chooseFromListChoice = (
  key: string,
  value: { _?: string } | null
): string =>
  t(`ChooseFromList.${key}.choice`, {
    value,
    defaultValue: value?._,
  });
