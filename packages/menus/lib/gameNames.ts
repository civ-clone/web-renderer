// The games' names for the page (#668, #1248), from the translations: here rather than beside the sets, which bring the
//  windows and art with them, so a page or test that only names a game needs nothing else.

import { t } from 'i18next';

/** A game's name, from the translations: its set's id where it has none. */
export const gameName = (id: string): string =>
  t(`PluginSet.${id}`, { defaultValue: id });

/** A game's title on its card in the setup (#1248): its own where the translations give one, its set's name otherwise. */
export const gameTitle = (id: string): string =>
  t(`PluginSetGame.${id}`, { defaultValue: gameName(id) });
