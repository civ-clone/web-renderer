// The controls the game setup (#605) and the resume window (#608) share: a civilization or leader named for the
//  page, a select made of options whose text is set as text, so a name with a quote or a bracket is safe (#3), and
//  holding the setup while it switches games (#668).

import { s } from '@dom111/element';
import { t } from 'i18next';

export const civilizationName = (name: string): string =>
  t(`${name}.name`, { defaultValue: name, ns: 'civilization' });

export const leaderName = (name: string): string =>
  t(`Leader.${name}.name`, { defaultValue: name, ns: 'civilization' });

export const option = (
  value: string,
  label: string,
  { disabled = false, selected = false } = {}
): HTMLOptionElement => {
  const element = document.createElement('option');

  element.value = value;
  element.textContent = label;
  element.disabled = disabled;
  element.selected = selected;

  return element;
};

export const select = (
  name: string,
  options: HTMLOptionElement[]
): HTMLSelectElement => {
  const element = s<HTMLSelectElement>(`<select name="${name}"></select>`);

  element.append(...options);

  return element;
};

/** A table cell holding `children`, made rather than parsed: `s()` parses inside a `<div>`, which drops table parts. */
export const cell = (...children: Node[]): HTMLTableCellElement => {
  const element = document.createElement('td');

  element.append(...children);

  return element;
};

/**
 * Holds every control in `root` but its title bar's (Close) while the setup switches games (#668): nothing it sends
 *  would reach the worker it was made for.
 */
export const holdControls = (root: Element): void =>
  root
    .querySelectorAll<
      | HTMLButtonElement
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
    >('button, input, select, textarea')
    .forEach((control) => {
      if (control.closest('header') === null) {
        control.disabled = true;
      }
    });
