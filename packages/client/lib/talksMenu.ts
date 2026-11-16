// The menu of what a person may propose in talks they lead (Civ2's, M2d, #1007), as the original's has it: the
//  proposals on its first level, and two of them leading to their own lists, the favours (an exchange of advances, war
//  on another civilization, sharing maps) and the gifts (an advance, gold or a unit). The engine offers each as a
//  choice of its own, in the original's order; this only says which are listed under which, so the windows can show
//  them as pickers. Talks with no such choices (Civ1's, which have no menu, #1071) are shown as they were.

import { Interactions } from '@civ-clone/ui-protocol/types';
import instanceOf from './instanceOf';
import { t } from 'i18next';

export type TalksGroup = 'favour' | 'gift';

/** The list a choice of the talks is shown under: the favours, the gifts, or none (the menu's first level). */
export const talksGroup = (value: Interactions): TalksGroup | null => {
  if (instanceOf(value, 'Gift')) {
    return 'gift';
  }

  return instanceOf(value, 'ExchangeKnowledge', 'JoinWar', 'ShareMaps')
    ? 'favour'
    : null;
};

export type TalksMenuEntry<Choice> =
  | { choice: Choice }
  | { group: TalksGroup; choices: Choice[] };

/** The choices as the menu lists them: each in place, but a group's together where its first is. */
export const talksMenu = <Choice extends { value: unknown }>(
  choices: Choice[]
): TalksMenuEntry<Choice>[] => {
  const entries: TalksMenuEntry<Choice>[] = [],
    groups = new Map<TalksGroup, { group: TalksGroup; choices: Choice[] }>();

  choices.forEach((choice) => {
    const group = talksGroup(choice.value as Interactions);

    if (group === null) {
      entries.push({ choice });

      return;
    }

    if (!groups.has(group)) {
      const entry = { group, choices: [] as Choice[] };

      groups.set(group, entry);
      entries.push(entry);
    }

    groups.get(group)!.choices.push(choice);
  });

  return entries;
};

/** What a group's entry on the first level says: "Ask a favor…", "Offer a gift…". */
export const talksGroupLabel = (group: TalksGroup): string =>
  t(`Negotiation.group.${group}`);
