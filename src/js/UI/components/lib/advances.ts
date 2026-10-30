import i18next, { t } from 'i18next';
import { PlayerResearch } from '../../types';

// An advance's name. A player can hold more than one of a repeatable advance (Future Technology 1, 2, …), so `number`
//  says which one: a translation with a `numbered` context shows it, and every other advance falls back to its plain
//  name.
export const advanceName = (advance: string, number: number = 1): string =>
  t(`${advance}.name`, {
    defaultValue: advance,
    ns: 'science',
    context: 'numbered',
    number,
  });

// How many of an advance the player holds.
export const held = (research: PlayerResearch, advance: string): number =>
  research.complete.filter((known) => known._ === advance).length;

// The name of the advance being researched, numbered as the next one the player would hold, or `null` for none.
export const researchingName = (research: PlayerResearch): string | null =>
  research.researching === null
    ? null
    : advanceName(
        research.researching._,
        held(research, research.researching._) + 1
      );

// Why a player researching nothing is asked what to research (#726), or `null` when they are researching something, the
//  reason isn't known (a new game, an older save), or it's one with no words here. The advance is named as the one
//  just gained, so a repeatable one gets its number.
export const researchClearedLabel = (
  research: PlayerResearch
): string | null => {
  const { cleared, researching } = research;

  if (researching !== null || !cleared) {
    return null;
  }

  const key = `Actions.ChooseResearch.cleared.${cleared.reason}`;

  if (!i18next.exists(key)) {
    return null;
  }

  return t(key, {
    advance: advanceName(
      cleared.advance._,
      Math.max(1, held(research, cleared.advance._))
    ),
  });
};

// Each advance named once, in the order first known, with the number of the last one held.
export const advanceNames = (advances: string[]): string[] => {
  const counts = new Map<string, number>();

  advances.forEach((advance) =>
    counts.set(advance, (counts.get(advance) ?? 0) + 1)
  );

  return [...counts].map(([advance, count]) => advanceName(advance, count));
};

export default advanceName;
