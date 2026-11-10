import {
  ChoiceDescriber,
  ChoiceRow,
} from '@civ-clone/ui-component-choice-window/ChoiceWindow';
import { defineSlot } from '@civ-clone/ui-client/lib/interfaceMode';

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
  // What a list that shows each row as one line of text says for it, where that says more than the name ("Alphabet (5
  //  turns)"): such a list has no room for `describe`.
  plainLabel?: (row: ChoiceRow) => string;
  // What a list of plain rows says over it, where the title alone is the question for one that shows more ("Please
  //  choose…"). By default `intro`.
  plainIntro?: string | Node | null;
}

/** What the list is to whoever opened it, whichever interface shows it. */
export interface ChoiceList {
  /** Whether it answered itself as it opened, having only one row. */
  autoChosen(): boolean;
  close(): void;
  on(event: 'close', listener: () => void): unknown;
}

type OpenChoice = (
  title: string,
  rows: ChoiceRow[],
  onChoose: (value: string) => void,
  options?: ChoiceListOptions
) => ChoiceList;

// The interface's `choiceList` slot (#824), which each interface in `interfaces/` fills (#825).
export const choiceList = defineSlot<OpenChoice>('choiceList');

/** Any other list (research, government, the ones the engine asks). */
export const openChoice: OpenChoice = (title, rows, onChoose, options) =>
  choiceList.current()(title, rows, onChoose, options);
