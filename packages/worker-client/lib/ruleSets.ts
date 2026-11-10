// The rule sets a new game can switch (#158): named groups of rules, some of them choices between alternatives, that
//  the plugins register in `game.ruleSets`. The page draws what `describe()` says and sends back what was chosen;
//  what switching a set does to the rules beneath it is decided here, by the registry, and nowhere on the page.

import {
  RuleSetChoice,
  RuleSetsAnswer,
  RuleSetsQuery,
} from '@civ-clone/ui-protocol/Requests/RuleSets';
import { RuleSetRegistry } from '@civ-clone/core-rule/RuleSetRegistry';
import { defaultGame } from '@civ-clone/core-game/defaultGame';

const isChoice = (value: unknown): value is RuleSetChoice =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as RuleSetChoice).id === 'string' &&
  ['boolean', 'string'].includes(typeof (value as RuleSetChoice).value);

const isChoices = (value: unknown): value is RuleSetChoice[] =>
  Array.isArray(value) && value.every(isChoice);

const answer = (ruleSets: RuleSetRegistry): RuleSetsAnswer => ({
  sets: ruleSets.describe(),
  choices: ruleSets.choices(),
});

/**
 * The sets as they are with the page's choices made, and its one change after them.
 *
 * Nothing is kept between one asking and the next: each starts from how the sets begin, so the page holds what has
 *  been chosen, as it does the rest of a game's setup. A choice nothing answers to is left out of the answer, and a
 *  change nothing answers to is refused. Once a game is being played (`fixed`), the sets are that game's: they are
 *  described, and nothing is switched.
 */
export const ruleSetsData = (
  query: RuleSetsQuery | null,
  fixed: boolean = false,
  ruleSets: RuleSetRegistry = defaultGame.ruleSets
): RuleSetsAnswer => {
  if (fixed) {
    return answer(ruleSets);
  }

  if (
    query !== null &&
    (typeof query !== 'object' ||
      !isChoices(query.choices) ||
      (query.change !== undefined && !isChoice(query.change)))
  ) {
    throw new TypeError(
      'The rule sets are asked for with { choices: { id, value }[], change?: { id, value } }.'
    );
  }

  // A rule or a set that a plugin names and nothing registered: said now, before a game is set up on it.
  ruleSets.check();
  ruleSets.restore(query?.choices ?? []);

  if (query?.change) {
    const { id, value } = query.change;

    if (typeof value === 'string') {
      ruleSets.choose(id, value);
    } else {
      ruleSets.set(id, value);
    }
  }

  return answer(ruleSets);
};

/**
 * Puts a game that is about to start under the rule sets it was set up with (the `ruleSets` option).
 *
 * Every one of them has to be made: a game that starts without a rule its player switched on, or with one they
 *  switched off, is not the game they set up, so it does not start.
 */
export const applyRuleSets = (
  choices: unknown,
  ruleSets: RuleSetRegistry = defaultGame.ruleSets
): void => {
  if (!isChoices(choices)) {
    throw new TypeError('The `ruleSets` option is a list of { id, value }.');
  }

  ruleSets.check();

  const unknown = ruleSets.restore(choices);

  if (unknown.length > 0) {
    throw new Error(
      `The game was set up with rule sets that are not here: ${unknown
        .map(({ id }) => id)
        .join(', ')}.`
    );
  }
};
