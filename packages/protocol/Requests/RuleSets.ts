import Request from '@civ-clone/core-data-client/Request';

/** One thing chosen (#158): a set or a rule switched on or off, or the member of a choice that was picked. */
export type RuleSetChoice = { id: string; value: boolean | string };

/**
 * A rule set, a choice between alternatives, or a rule, as the worker describes it and the setup draws it, with what
 *  is beneath (#158). The page works none of it out: `state` is what a checkbox shows (`mixed` for a set whose rules
 *  differ), `chosen` the alternative in force, `active` whether any of it applies (it doesn't beneath an alternative
 *  that isn't the chosen one, nor in what is superseded), and `switchable` whether there is anything to switch on or
 *  off. A set that takes the place of other packages' rules (#954) lists them in `supersedes`, and what one of those
 *  sets has replaced just now names them in `supersededBy`.
 */
export type RuleSetNode = {
  id: string;
  kind: 'set' | 'choice' | 'rule';
  state: 'on' | 'off' | 'mixed';
  active: boolean;
  switchable: boolean;
  chosen?: string | null;
  supersedes?: string[];
  supersededBy?: string[];
  members: RuleSetNode[];
};

/**
 * Something wrong with the sets as they stand (#954), as the rules find it. `conflict` is the player's to settle: two
 *  sets that replace the same rule (`ids`) are both on. `cycle`, `duplicate-id`, `option-conflict` and `no-default`
 *  are a package's mistake. `unknown-member` and `unknown-superseded` are a set (`ids[0]`) naming something that isn't
 *  loaded (`ids[1]`). `blocking` is whether a game can start while it stands; `message` is in English, for whoever
 *  wrote the package.
 */
export type RuleSetProblem = {
  kind:
    | 'conflict'
    | 'cycle'
    | 'duplicate-id'
    | 'option-conflict'
    | 'no-default'
    | 'unknown-member'
    | 'unknown-superseded';
  ids: string[];
  message: string;
  blocking: boolean;
};

/** What has been chosen so far, and one change to make to it. */
export type RuleSetsQuery = {
  choices: RuleSetChoice[];
  change?: RuleSetChoice;
};

/**
 * The sets as they then are, the choices that say so (what the setup sends when the game starts), and what is wrong
 *  with them, if anything: a game doesn't start while a `blocking` problem stands.
 */
export type RuleSetsAnswer = {
  sets: RuleSetNode[];
  choices: RuleSetChoice[];
  problems: RuleSetProblem[];
};

// The rule sets a new game can switch (#158). Asked with nothing, it answers the sets as they start. Asked with the
//  choices so far and a change, it answers what they become: switching a set switches what is beneath it, which is the
//  rules' business, so the page asks and doesn't work it out. Once a game has started it answers that game's.
export class RuleSets extends Request<[RuleSetsQuery | null], RuleSetsAnswer> {
  constructor(query: RuleSetsQuery | null = null) {
    super('ruleSets', query);
  }
}

export default RuleSets;
