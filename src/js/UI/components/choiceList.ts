import ChoiceWindow, { ChoiceDescriber, ChoiceRow } from './ChoiceWindow';
import SelectionWindow from './SelectionWindow';
import { interfaceMode } from '../lib/interfaceMode';
import { s } from '@dom111/element';

// A list of plain rows, the classic list or the choice window (#745). Apart from `choices.ts` so that what imports it
//  (the arrival prompts, the engine's lists) doesn't load the build list and the unit sprites with it.

export interface ChoiceListOptions {
  // Over the list: the question, or why it has opened. A string is text; an empty one is no intro.
  intro?: string | Node | null;
  // The row chosen as the list opens. By default the first.
  chosen?: string | null;
  // Whether the list can be left with nothing chosen.
  canClose?: boolean;
  // Over everything else, which waits for the answer.
  modal?: boolean;
  // The window's classes, for its eyebrow.
  classes?: string[];
  describe?: ChoiceDescriber | null;
  // What the classic list says for a row, where it says more than the name ("Alphabet (5 turns)").
  classicLabel?: (row: ChoiceRow) => string;
  // What the classic list says over it, where the title alone is the question for the new one ("Please choose…").
  classicIntro?: string | Node | null;
}

/**
 * Any other list (research, government, the ones the engine asks): the classic list of labels, or under the new
 *  interface the choice window, with each row's facts, the pane and a primary naming the choice.
 */
export const openChoice = (
  title: string,
  rows: ChoiceRow[],
  onChoose: (value: string) => void,
  {
    intro = null,
    chosen = null,
    canClose = true,
    modal = false,
    classes = [],
    describe = null,
    classicLabel = ({ label }) => label,
    classicIntro = intro,
  }: ChoiceListOptions = {}
): ChoiceWindow | SelectionWindow => {
  if (interfaceMode() === 'new') {
    let introNode: Node | null = typeof intro === 'string' ? null : intro;

    if (typeof intro === 'string' && intro !== '') {
      introNode = s('<p></p>');
      introNode.textContent = intro;
    }

    return new ChoiceWindow(title, rows, onChoose, {
      canClose,
      modal,
      chosen,
      classes,
      describe,
      intro: introNode,
    });
  }

  const window = new SelectionWindow(
    title,
    rows.map((row) => ({
      label: classicLabel(row),
      value: row.value,
      ...(row.group === undefined ? {} : { group: row.group }),
    })),
    onChoose,
    classicIntro,
    {
      canClose,
      displayAll: true,
      modal,
    }
  );

  if (chosen !== null && !window.autoChosen()) {
    window.selectionList().value = chosen;
  }

  return window;
};
