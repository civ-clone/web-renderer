// The rule sets a new game can switch (#158): named groups of rules, some of them choices between alternatives, that
//  the plugins register in `game.ruleSets`. The page draws what `describe()` says and sends back what was chosen;
//  what switching a set does to the rules beneath it is decided here, by the registry, and nowhere on the page. So is
//  what is wrong with them (#954): `validate()`'s problems go with each answer, for the page to show, and one that
//  blocks keeps a game from starting or loading.

import {
  RuleSetChoice,
  RuleSetProblem,
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
  problems: ruleSets.validate(),
});

// A game is not started or loaded while a problem that blocks stands: the setup holds Start, so this is a backstop.
const refuseBlocked = (problems: RuleSetProblem[], what: string): void => {
  const blocking = problems.filter(({ blocking }) => blocking);

  if (blocking.length > 0) {
    throw new Error(
      `${what} can't be used as they are: ${blocking
        .map(({ message }) => message)
        .join(' ')}`
    );
  }
};

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

  // What is wrong with the sets is answered, not thrown: the setup shows it, and holds Start while it blocks.
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
 *  switched off, is not the game they set up, so it does not start. Nor does one whose sets, as chosen, have a problem
 *  that blocks (#954).
 */
export const applyRuleSets = (
  choices: unknown,
  ruleSets: RuleSetRegistry = defaultGame.ruleSets
): void => {
  if (!isChoices(choices)) {
    throw new TypeError('The `ruleSets` option is a list of { id, value }.');
  }

  const unknown = ruleSets.restore(choices);

  if (unknown.length > 0) {
    throw new Error(
      `The game was set up with rule sets that are not here: ${unknown
        .map(({ id }) => id)
        .join(', ')}.`
    );
  }

  refuseBlocked(ruleSets.validate(), 'The rule sets the game was set up with');
};

/**
 * Before a save is put back: its rule sets, as it chose them, are refused if they have a problem that blocks (#954),
 *  as a new game's would be. Returns those that don't, a set naming something that isn't loaded, for the host to say:
 *  the game is played without it.
 *
 * Choices that aren't a list of them, or none at all, are the load's to refuse or to start from the defaults: the sets
 *  are checked as they start.
 */
export const checkSavedRuleSets = (
  choices: unknown,
  ruleSets: RuleSetRegistry = defaultGame.ruleSets
): RuleSetProblem[] => {
  if (isChoices(choices)) {
    ruleSets.restore(choices);
  } else {
    ruleSets.reset();
  }

  const problems = ruleSets.validate();

  refuseBlocked(problems, "The saved game's rule sets");

  return problems;
};
