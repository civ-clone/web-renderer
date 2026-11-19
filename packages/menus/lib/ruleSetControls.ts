// The rule sets a new game can switch (#158), as both interfaces' setup draws them: a list of checkboxes, one to a
//  set, with the sets inside a set beneath it, and a group of radio buttons for a choice between alternatives. A set
//  whose rules differ shows as a checkbox that is neither ticked nor clear. What is ticked, and what ticking one does
//  to the ones beneath it, is the worker's to say: this draws the tree it sends, and says what was changed.
//
// So is what is wrong with them (#954), drawn above the tree: two sets that can't both be on, said as the player's to
//  settle, with both sets' rows marked; a package's mistake, which the player can't settle, said as such with the
//  rules' own words beneath; and a set that names a rule that isn't loaded, said quietly. While one that blocks
//  stands, Start is held, and is described by it. A rule another set has replaced says so beside its name.
//
// A choice beneath a set that is switched off is greyed out (#1008). Switching a set off doesn't reach into a choice
//  inside it, which keeps its pick for when the set is on again, so the choice says what the set does when it is on.
//  The registry doesn't say so itself (`describe()` has the choice active), so this is worked out here until it does
//  (#1121).

import {
  RuleSetChoice,
  RuleSetNode,
  RuleSetProblem,
} from '@civ-clone/ui-protocol/Requests/RuleSets';
import GameSetup, {
  GameChoice,
  gameOf,
} from '@civ-clone/ui-client/lib/gameSetup';
import { gameTitle } from './gameNames';
import { holdControls } from './setupControls';
import Transport from '@civ-clone/ui-client/Transport';
import i18next, { t } from 'i18next';

// An id is `package:path/to/thing`, and both `:` and `/` mean something else in a translation key.
const key = (id: string): string => id.replace(/[:/]/g, '.');

const named = (id: string): boolean =>
  i18next.exists(`${key(id)}.name`, { ns: 'ruleset' });

/** A set's, a choice's or a rule's name for the page: its translation, or its id when a plugin gives it none. */
export const ruleSetName = (id: string): string =>
  t(`${key(id)}.name`, { defaultValue: id, ns: 'ruleset' });

/** A line on what it does, or nothing. */
export const ruleSetDescription = (id: string): string =>
  t(`${key(id)}.description`, { defaultValue: '', ns: 'ruleset' });

// A rule is drawn where a player would choose it by name: as an alternative of a choice, or when the translations
//  name it. The thirteen rules of "units go obsolete" are switched as one, and are not thirteen checkboxes.
const drawn = (node: RuleSetNode, parent: RuleSetNode | null): boolean =>
  node.kind !== 'rule' || parent?.kind === 'choice' || named(node.id);

// A set that is only a heading, with nothing drawn beneath it, has nothing to show.
const worthDrawing = (node: RuleSetNode, parent: RuleSetNode | null): boolean =>
  drawn(node, parent) &&
  (node.kind !== 'set' ||
    node.switchable ||
    node.members.some((member) => worthDrawing(member, node)));

const text = (tag: string, className: string, content: string): HTMLElement => {
  const element = document.createElement(tag);

  element.className = className;
  element.textContent = content;

  return element;
};

// Ids for what a control is described by and a list is labelled by: unique on the page, and nothing else.
let ids = 0;

const identified = <T extends HTMLElement>(element: T): T => {
  element.id = `rule-set-${++ids}`;

  return element;
};

const described = (id: string): HTMLElement[] => {
  const description = ruleSetDescription(id);

  return description === ''
    ? []
    : [identified(text('p', 'rule-set-description', description))];
};

// The sets a problem is about (a conflict's two), each with the ids of the lines that say so.
type Marked = Map<string, string[]>;

const describedBy = (
  control: HTMLElement,
  description: HTMLElement[],
  problems: string[] = []
): void => {
  const by = [...description.slice(0, 1).map(({ id }) => id), ...problems];

  if (by.length > 0) {
    control.setAttribute('aria-describedby', by.join(' '));
  }
};

// A set with a problem about it: its row marked, and its control said to be in error, described by the problem.
const mark = (
  row: HTMLElement,
  control: HTMLElement | null,
  id: string,
  marked: Marked
): string[] => {
  const lines = marked.get(id) ?? [];

  if (lines.length > 0) {
    row.classList.add('rule-set-conflict');
    control?.setAttribute('aria-invalid', 'true');
  }

  return lines;
};

// What has replaced this just now (#954), beside its name, apart from it for the label read as a whole as well as
//  seen: nothing for what nothing has.
const replaced = (node: RuleSetNode): Node[] =>
  (node.supersededBy ?? []).length === 0
    ? []
    : [
        document.createTextNode(' '),
        text(
          'span',
          'rule-set-replaced',
          t('RuleSets.replaced-by', {
            ns: 'ruleset',
            names: node.supersededBy!.map(ruleSetName),
            interpolation: { escapeValue: false },
          })
        ),
      ];

// Where a control is in the tree, which is what it is found again by after a redraw: a rule that two sets hold is
//  drawn under each, and the keyboard goes back to the one it was on.
const under = (path: string, id: string): string =>
  path === '' ? id : `${path}\n${id}`;

const input = (
  type: 'checkbox' | 'radio',
  focusKey: string,
  label: string,
  {
    checked = false,
    disabled = false,
    mixed = false,
    name = '',
    note = [],
    value = '',
  }: {
    checked?: boolean;
    disabled?: boolean;
    mixed?: boolean;
    name?: string;
    note?: Node[];
    value?: string;
  }
): [HTMLInputElement, HTMLLabelElement, HTMLElement] => {
  const control = document.createElement('input'),
    wrapper = document.createElement('label'),
    named = identified(text('span', 'rule-set-name', label));

  control.type = type;
  control.checked = checked;
  control.disabled = disabled;
  control.indeterminate = mixed;
  control.dataset.ruleSet = focusKey;

  if (name !== '') {
    control.name = name;
    control.value = value;
  }

  // In the name's own line, and not beside it as a flex item of its own, so that the two wrap as one sentence where
  //  the window is narrow.
  named.append(...note);
  wrapper.append(control, named);

  return [control, wrapper, named];
};

const item = (
  node: RuleSetNode,
  path: string,
  change: (choice: RuleSetChoice) => void,
  marked: Marked,
  // Whether a set this is beneath is switched off.
  off: boolean
): HTMLLIElement => {
  const element = document.createElement('li'),
    here = under(path, node.id),
    // What is beneath `of`, as a list named by what it is beneath.
    inside = (
      members: RuleSetNode[],
      of: RuleSetNode,
      at: string,
      label: HTMLElement
    ): HTMLElement[] => {
      const shown = members.filter((member) => worthDrawing(member, of));

      if (shown.length === 0) {
        return [];
      }

      const beneath = list(
        shown,
        of,
        at,
        change,
        marked,
        off || (of.kind === 'set' && of.state === 'off')
      );

      beneath.setAttribute('aria-labelledby', label.id);

      return [beneath];
    };

  element.className = 'rule-set';
  element.dataset.kind = node.kind;

  if (node.kind === 'choice') {
    const group = document.createElement('fieldset'),
      about = described(node.id);

    group.disabled = !node.active || off;
    describedBy(group, about, mark(element, null, node.id, marked));

    const legend = text('legend', 'rule-set-name', ruleSetName(node.id));

    legend.append(...replaced(node));
    group.append(
      legend,
      ...about,
      // Each alternative is a radio button, with what is beneath it: a rule here is drawn by its choice, and a set
      //  that is an alternative has no checkbox of its own.
      ...node.members.map((member) => {
        const aboutMember = described(member.id),
          [control, wrapper, label] = input(
            'radio',
            under(here, member.id),
            ruleSetName(member.id),
            {
              checked: member.id === node.chosen,
              name: `rule-set:${here}`,
              note: replaced(member),
              value: member.id,
            }
          ),
          alternative = document.createElement('div');

        describedBy(
          control,
          aboutMember,
          mark(alternative, control, member.id, marked)
        );

        control.addEventListener('change', () => {
          if (control.checked) {
            change({ id: node.id, value: member.id });
          }
        });

        alternative.className = 'rule-set-alternative';
        alternative.append(
          wrapper,
          ...aboutMember,
          // An alternative that is itself a choice is drawn as one, beneath its radio button: its own alternatives
          //  are picked from, not ticked.
          ...(member.kind === 'choice'
            ? inside([member], node, here, label)
            : inside(member.members, member, under(here, member.id), label))
        );

        return alternative;
      })
    );

    element.append(group);

    return element;
  }

  const about = described(node.id);

  // A set with nothing of its own to switch is a heading over what is beneath it.
  if (node.kind === 'set' && !node.switchable) {
    const heading = identified(
      text('span', 'rule-set-name rule-set-heading', ruleSetName(node.id))
    );

    heading.append(...replaced(node));
    // Nothing to describe: the row is marked, and the line is there above.
    mark(element, null, node.id, marked);
    element.append(
      heading,
      ...about,
      ...inside(node.members, node, here, heading)
    );

    return element;
  }

  const [control, wrapper, label] = input(
    'checkbox',
    here,
    ruleSetName(node.id),
    {
      checked: node.state === 'on',
      disabled: !node.active,
      mixed: node.state === 'mixed',
      note: replaced(node),
    }
  );

  describedBy(control, about, mark(element, control, node.id, marked));

  control.addEventListener('change', () =>
    change({ id: node.id, value: control.checked })
  );

  element.append(wrapper, ...about, ...inside(node.members, node, here, label));

  return element;
};

const list = (
  nodes: RuleSetNode[],
  parent: RuleSetNode | null,
  path: string,
  change: (choice: RuleSetChoice) => void,
  marked: Marked,
  off: boolean = false
): HTMLUListElement => {
  const element = document.createElement('ul');

  element.className = 'rule-sets';
  element.append(...nodes.map((node) => item(node, path, change, marked, off)));

  return element;
};

/** Whether there is anything to draw: a setup with no rule sets shows no section for them. */
export const hasRuleSets = (sets: RuleSetNode[]): boolean =>
  sets.some((node) => worthDrawing(node, null));

/** What `renderRuleSetProblems` drew: the lines that keep a game from starting, and the sets a line is about. */
export type DrawnProblems = { blocking: string[]; marked: Marked };

// What each container last drew, and from what: a live region, it says again whatever is put back into it, so the
//  same problems are left as they are.
const drawnIn = new WeakMap<
  HTMLElement,
  { problems: string; drawn: DrawnProblems }
>();

/**
 * Draws what is wrong with the sets (#954) into `container`, in place of what it held, as the worker found it: nothing
 *  is worked out here. A conflict names both sets; a package's mistakes are one line, with the rules' own words for
 *  each beneath; a set naming a rule that isn't loaded is a quiet note, once for each set, and holds nothing up. The
 *  same problems as the container shows already are left as they are.
 */
export const renderRuleSetProblems = (
  container: HTMLElement,
  problems: RuleSetProblem[]
): DrawnProblems => {
  const said = JSON.stringify(problems),
    shown = drawnIn.get(container);

  if (shown?.problems === said) {
    return shown.drawn;
  }

  const drawn: DrawnProblems = { blocking: [], marked: new Map() },
    lines: HTMLElement[] = [],
    line = (className: string, content: string): HTMLElement =>
      identified(text('li', `rule-set-problem ${className}`, content)),
    blocking = (element: HTMLElement): HTMLElement => {
      drawn.blocking.push(element.id);

      return element;
    },
    names = { interpolation: { escapeValue: false }, ns: 'ruleset' };

  problems
    .filter(({ kind }) => kind === 'conflict')
    .forEach(({ ids: [first = '', second = ''] }) => {
      const element = blocking(
        line(
          'rule-set-error',
          t('RuleSets.conflict', {
            ...names,
            first: ruleSetName(first),
            second: ruleSetName(second),
          })
        )
      );

      [first, second].forEach((id) =>
        drawn.marked.set(id, [...(drawn.marked.get(id) ?? []), element.id])
      );
      lines.push(element);
    });

  // Whether a package's mistake blocks is the rules' to say: one that doesn't is still said, and holds nothing up.
  const mistakes = problems.filter(
    ({ kind }) =>
      kind !== 'conflict' &&
      kind !== 'unknown-member' &&
      kind !== 'unknown-superseded'
  );

  if (mistakes.length > 0) {
    const element = line(
        'rule-set-error',
        t('RuleSets.unusable', { ns: 'ruleset' })
      ),
      details = document.createElement('ul');

    details.className = 'rule-set-problem-details';
    details.append(
      ...mistakes.map(({ message }) =>
        text('li', 'rule-set-problem-detail', message)
      )
    );
    element.append(details);
    lines.push(
      mistakes.some(({ blocking }) => blocking) ? blocking(element) : element
    );
  }

  new Set(
    problems
      .filter(
        ({ kind }) => kind === 'unknown-member' || kind === 'unknown-superseded'
      )
      .map(({ ids: [set = ''] }) => set)
  ).forEach((set) =>
    lines.push(
      line(
        'rule-set-note',
        t('RuleSets.not-loaded', { ...names, name: ruleSetName(set) })
      )
    )
  );

  drawnIn.set(container, { problems: said, drawn });

  if (lines.length === 0) {
    container.replaceChildren();

    return drawn;
  }

  const element = document.createElement('ul');

  element.className = 'rule-set-problems';
  element.append(...lines);
  container.replaceChildren(element);

  return drawn;
};

/**
 * Holds Start while a problem that blocks stands, described by the lines that say what it is, and lets it go when
 *  none does.
 */
export const holdStart = (
  start: HTMLButtonElement,
  { blocking }: DrawnProblems,
  // A start already on its way, waiting on a change: held until it goes ahead or is turned down.
  starting: boolean = false
): void => {
  start.disabled = blocking.length > 0 || starting;

  if (blocking.length > 0) {
    start.setAttribute('aria-describedby', blocking.join(' '));
  } else {
    start.removeAttribute('aria-describedby');
  }
};

/**
 * Draws `sets` into `container`, in place of what it held, and calls `change` with each thing the player changes. A
 *  set in `marked` (from `renderRuleSetProblems`) has its row marked, described by the lines about it.
 *
 * The keyboard stays where it was: the control that had it is found again by what it switches, since every control is
 *  made anew.
 */
export const renderRuleSets = (
  container: HTMLElement,
  sets: RuleSetNode[],
  change: (choice: RuleSetChoice) => void,
  marked: Marked = new Map()
): void => {
  const focused =
    document.activeElement instanceof HTMLElement &&
    container.contains(document.activeElement)
      ? document.activeElement.dataset.ruleSet ?? null
      : null;

  container.replaceChildren(
    list(
      sets.filter((node) => worthDrawing(node, null)),
      null,
      '',
      change,
      marked
    )
  );

  if (focused !== null) {
    [...container.querySelectorAll<HTMLElement>('[data-rule-set]')]
      .find((control) => control.dataset.ruleSet === focused)
      ?.focus();
  }
};

/**
 * The game a setup is for (#1248), and how to set it up for another: another game, or the same game's other rules,
 *  is another setup, on a worker loaded with that set, so `switchTo` is given the set it is played with.
 */
export type SetupGame = {
  choice: GameChoice;
  switchTo: (pluginSet: string, focus: RuleSwitch) => void;
};

/** The radio buttons a setup is switched with (#1248), by their group's name, for the keyboard to go back to. */
export type RuleSwitch = 'rule-game' | 'rule-variant';

/** Puts the keyboard on the checked radio button of the group `name` in `root`: a setup switched with it (#1248). */
export const focusRuleSwitch = (root: Element, name: RuleSwitch): void =>
  Array.from(root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`))
    .find(({ checked }) => checked)
    ?.focus();

// A radio button and its label, as the setup's own controls are: the label first in the tree for a screen reader, the
//  button inside it so the whole row is what's clicked.
const radio = (
  name: string,
  value: string,
  label: string,
  checked: boolean,
  className: string
): [HTMLInputElement, HTMLLabelElement] => {
  const control = document.createElement('input'),
    wrapper = document.createElement('label');

  control.type = 'radio';
  control.name = name;
  control.value = value;
  control.checked = checked;
  wrapper.className = className;
  wrapper.append(control, text('span', `${className}-name`, label));

  return [control, wrapper];
};

/**
 * The games the setup offers, as a row of cards (#1248), then the chosen one's rules beneath: Original or Enhanced
 *  where the game has both, the enhanced rules' own changes under Enhanced (`changes`, drawn into by the caller), and
 *  the game's other sets after (`rest`). Picking another game, or the game's other rules, is `switchTo`.
 */
const renderGames = (
  { choice, switchTo }: SetupGame,
  changes: HTMLDetailsElement,
  rest: HTMLElement
): HTMLElement[] => {
  const game = gameOf(choice, choice.id),
    original = choice.originals[game],
    cards = document.createElement('fieldset'),
    rules = document.createElement('div'),
    // A radio button that switches the setup once it's picked, and not as the setup draws it.
    switching = (
      control: HTMLInputElement,
      pluginSet: string,
      focus: RuleSwitch
    ): void =>
      control.addEventListener('change', (): void => {
        if (control.checked && pluginSet !== choice.id) {
          switchTo(pluginSet, focus);
        }
      });

  cards.className = 'rule-game-cards';
  cards.append(
    text('legend', 'visually-hidden', t('GameSetup.game')),
    ...choice.games.map((card) => {
      const [control, label] = radio(
        'rule-game',
        card,
        gameTitle(card),
        card === game,
        'rule-game-card'
      );

      switching(control, card, 'rule-game');
      label.classList.toggle('chosen', card === game);

      return label;
    })
  );

  rules.className = 'rule-game-rules';

  if (original !== undefined) {
    const variants = document.createElement('fieldset');

    variants.className = 'rule-variants';
    variants.append(
      text(
        'legend',
        'visually-hidden',
        t('GameSetup.game-rules', {
          game: gameTitle(game),
          interpolation: { escapeValue: false },
        })
      ),
      ...(
        [
          [original, 'original'],
          [game, 'enhanced'],
        ] as const
      ).map(([pluginSet, variant]) => {
        const row = document.createElement('div'),
          [control, label] = radio(
            'rule-variant',
            pluginSet,
            t(`GameSetup.rules-${variant}`),
            choice.id === pluginSet,
            'rule-variant'
          ),
          about = identified(
            text(
              'p',
              'rule-set-description',
              t(`GameSetup.rules-${variant}-description`)
            )
          );

        control.setAttribute('aria-describedby', about.id);
        switching(control, pluginSet, 'rule-variant');
        row.className = 'rule-variant-row';
        row.append(label, about);

        // The enhanced rules' own changes, beneath it, while it is the rules chosen.
        if (variant === 'enhanced' && choice.id === game) {
          row.append(changes);
        }

        return row;
      })
    );
    rules.append(variants);
  }

  rules.append(rest);

  return [cards, rules];
};

/**
 * The setup's Rules section: what is wrong with the sets, then the sets, under a summary, open, redrawn from the
 *  worker's answer to each change, with `start` held while a problem that blocks stands (#954). With `game`, the games
 *  to choose from first, as cards, and the chosen one's Original and Enhanced rules (#1248). Nothing when there is no
 *  game to choose, no rule sets to draw, and nothing wrong with them.
 */
export const ruleSetsSection = (
  setup: GameSetup,
  transport: Transport,
  className: string,
  start: HTMLButtonElement,
  game?: SetupGame
): HTMLDetailsElement | null => {
  if (
    game === undefined &&
    !hasRuleSets(setup.ruleSets) &&
    setup.ruleSetProblems.length === 0
  ) {
    return null;
  }

  // The enhanced rules' own set, drawn beneath Enhanced rather than as a checkbox of its own: by the set's id, which
  //  is the game's (`civ1-enhanced`). None while the original rules are chosen, or for a game without them.
  const enhancedSet =
      game !== undefined && game.choice.originals[game.choice.id] !== undefined
        ? game.choice.id
        : null,
    section = document.createElement('details'),
    summary = document.createElement('summary'),
    // Kept from one answer to the next, so that a problem that comes or goes is said as it does.
    problems = document.createElement('div'),
    // The enhanced rules' changes, folded beneath Enhanced: there are many, and the map and the seats come after.
    changes = document.createElement('details'),
    changesSummary = document.createElement('summary'),
    enhanced = document.createElement('div'),
    holder = document.createElement('div'),
    // Drawn again after a change answered while the setup switches (#1248): held, as the rest of the setup is.
    render = (): void => {
      draw();

      if (setup.switching) {
        holdControls(section);
      }
    },
    draw = (): void => {
      const drawn = renderRuleSetProblems(problems, setup.ruleSetProblems),
        change = (choice: RuleSetChoice): void => {
          // Nothing while the setup switches to another game or rules (#1248): the worker is on its way to it.
          if (setup.switching) {
            render();

            return;
          }

          // Drawn again however it went: a change that failed puts the controls back as the sets are.
          void setup.changeRuleSet(transport, choice).finally(render);
        },
        own = setup.ruleSets.find(({ id }) => id === enhancedSet);

      holdStart(start, drawn, setup.starting());

      if (own === undefined) {
        renderRuleSets(holder, setup.ruleSets, change, drawn.marked);

        return;
      }

      const shown = own.members.filter((member) => worthDrawing(member, own)),
        within = new Set<string>(),
        collect = (nodes: RuleSetNode[]): void =>
          nodes.forEach(({ id, members }) => {
            within.add(id);
            collect(members);
          });

      collect(own.members);

      // A change with some of what is beneath it on counts as on: it changes the game.
      changesSummary.textContent = t('GameSetup.rules-changes', {
        on: shown.filter(({ state }) => state !== 'off').length,
        count: shown.length,
      });

      // Opened on a problem about something folded inside, for the player to see what it is about.
      if ([...drawn.marked.keys()].some((id) => within.has(id))) {
        changes.setAttribute('open', '');
      }
      renderRuleSets(enhanced, own.members, change, drawn.marked);
      renderRuleSets(
        holder,
        setup.ruleSets.filter((node) => node !== own),
        change,
        drawn.marked
      );
    };

  problems.setAttribute('aria-live', 'polite');
  enhanced.className = 'rule-variant-sets';
  changes.className = 'rule-variant-changes';
  changes.append(changesSummary, enhanced);

  section.className = className;
  // The attribute, which is all a parsed `<details open>` has.
  section.setAttribute('open', '');
  summary.textContent = t('GameSetup.rules');
  section.append(
    summary,
    problems,
    ...(game === undefined ? [holder] : renderGames(game, changes, holder))
  );

  render();

  return section;
};
