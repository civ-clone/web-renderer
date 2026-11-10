// The rule sets a new game can switch (#158), as both interfaces' setup draws them: a list of checkboxes, one to a
//  set, with the sets inside a set beneath it, and a group of radio buttons for a choice between alternatives. A set
//  whose rules differ shows as a checkbox that is neither ticked nor clear. What is ticked, and what ticking one does
//  to the ones beneath it, is the worker's to say: this draws the tree it sends, and says what was changed.

import {
  RuleSetChoice,
  RuleSetNode,
} from '@civ-clone/ui-protocol/Requests/RuleSets';
import GameSetup from '@civ-clone/ui-client/lib/gameSetup';
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

const described = (id: string): HTMLElement[] => {
  const description = ruleSetDescription(id);

  return description === ''
    ? []
    : [text('p', 'rule-set-description', description)];
};

const input = (
  type: 'checkbox' | 'radio',
  focusKey: string,
  label: string,
  { checked = false, disabled = false, mixed = false, name = '', value = '' }
): [HTMLInputElement, HTMLLabelElement] => {
  const control = document.createElement('input'),
    wrapper = document.createElement('label');

  control.type = type;
  control.checked = checked;
  control.disabled = disabled;
  control.indeterminate = mixed;
  control.dataset.ruleSet = focusKey;

  if (name !== '') {
    control.name = name;
    control.value = value;
  }

  wrapper.append(control, text('span', 'rule-set-name', label));

  return [control, wrapper];
};

const item = (
  node: RuleSetNode,
  parent: RuleSetNode | null,
  change: (choice: RuleSetChoice) => void
): HTMLLIElement => {
  const element = document.createElement('li'),
    inside = (members: RuleSetNode[], of: RuleSetNode): HTMLElement[] => {
      const shown = members.filter((member) => worthDrawing(member, of));

      return shown.length === 0 ? [] : [list(shown, of, change)];
    };

  element.className = 'rule-set';
  element.dataset.kind = node.kind;

  if (node.kind === 'choice') {
    const group = document.createElement('fieldset');

    group.disabled = !node.active;
    group.append(
      text('legend', 'rule-set-name', ruleSetName(node.id)),
      ...described(node.id),
      ...node.members.map((member) => {
        const [control, wrapper] = input(
            'radio',
            `${node.id}\n${member.id}`,
            ruleSetName(member.id),
            {
              checked: member.id === node.chosen,
              name: `rule-set:${node.id}`,
              value: member.id,
            }
          ),
          alternative = document.createElement('div');

        control.addEventListener('change', () => {
          if (control.checked) {
            change({ id: node.id, value: member.id });
          }
        });

        alternative.className = 'rule-set-alternative';
        alternative.append(
          wrapper,
          ...described(member.id),
          ...inside(member.members, member)
        );

        return alternative;
      })
    );

    element.append(group);

    return element;
  }

  // A set with nothing of its own to switch is a heading over what is beneath it.
  if (node.kind === 'set' && !node.switchable) {
    element.append(
      text('span', 'rule-set-name rule-set-heading', ruleSetName(node.id)),
      ...described(node.id),
      ...inside(node.members, node)
    );

    return element;
  }

  // An alternative is drawn by its choice, as a radio button: here it is only what is beneath it.
  const [control, wrapper] = input('checkbox', node.id, ruleSetName(node.id), {
    checked: node.state === 'on',
    disabled: !node.active,
    mixed: node.state === 'mixed',
  });

  control.addEventListener('change', () =>
    change({ id: node.id, value: control.checked })
  );

  element.append(wrapper, ...described(node.id), ...inside(node.members, node));

  return element;
};

const list = (
  nodes: RuleSetNode[],
  parent: RuleSetNode | null,
  change: (choice: RuleSetChoice) => void
): HTMLUListElement => {
  const element = document.createElement('ul');

  element.className = 'rule-sets';
  element.append(...nodes.map((node) => item(node, parent, change)));

  return element;
};

/** Whether there is anything to draw: a setup with no rule sets shows no section for them. */
export const hasRuleSets = (sets: RuleSetNode[]): boolean =>
  sets.some((node) => worthDrawing(node, null));

/**
 * Draws `sets` into `container`, in place of what it held, and calls `change` with each thing the player changes.
 *
 * The keyboard stays where it was: the control that had it is found again by what it switches, since every control is
 *  made anew.
 */
export const renderRuleSets = (
  container: HTMLElement,
  sets: RuleSetNode[],
  change: (choice: RuleSetChoice) => void
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
      change
    )
  );

  if (focused !== null) {
    [...container.querySelectorAll<HTMLElement>('[data-rule-set]')]
      .find((control) => control.dataset.ruleSet === focused)
      ?.focus();
  }
};

/**
 * The setup's Rules section: the sets under a summary, open, redrawn from the worker's answer to each change. Nothing
 *  when there are no rule sets to draw.
 */
export const ruleSetsSection = (
  setup: GameSetup,
  transport: Transport,
  className: string
): HTMLDetailsElement | null => {
  if (!hasRuleSets(setup.ruleSets)) {
    return null;
  }

  const section = document.createElement('details'),
    summary = document.createElement('summary'),
    holder = document.createElement('div'),
    render = (): void =>
      renderRuleSets(holder, setup.ruleSets, (change: RuleSetChoice): void => {
        void setup.changeRuleSet(transport, change).then(render);
      });

  section.className = className;
  // The attribute, which is all a parsed `<details open>` has.
  section.setAttribute('open', '');
  summary.textContent = t('GameSetup.rules');
  section.append(summary, holder);

  render();

  return section;
};
