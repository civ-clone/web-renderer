import { Negotiation, Player } from '@civ-clone/ui-protocol/types';
import Transport from '@civ-clone/ui-client/Transport';
import { defineSlot } from '@civ-clone/ui-client/lib/interfaceMode';

// The interface's `talks` slot (#860): how a step of the talks with another leader is shown, and answered. The classic
//  interface has a window with Continue for a step with one answer and a list for several; the modern one its meeting
//  window (#752).

// What answers a step for the `?debug=1` stress runner: structural, as it lives in `game`, which no interface reaches.
export type TalksStressRunner = {
  automateChoice(
    window: { close(): void },
    choiceId: string,
    onChoose: (choiceId: string) => void
  ): void;
};

export type TalksStep = {
  // The list's own title, for a step that can't name who it's with.
  title: string;
  // The answers, in the engine's order.
  choices: { id: string; value: unknown }[];
  // The talks so far, which the step carries.
  negotiation: Negotiation | null;
  // The player answering: whoever the answers are all by, or null where they aren't all by one (#751).
  us: Player | null;
  // Sends the answer, once.
  reply: (choiceId: string) => void;
  // The stress runner, which answers in the player's place.
  stressRunner: TalksStressRunner | null;
  transport: Transport;
};

/** Talks waiting on the player's answer, for the Next Turn button (#702). */
export type OpenTalks = {
  // Who they're with.
  leader: string;
  // Brings their window to the front.
  show: () => void;
  // Called once their window has gone, answered or not.
  closed: (callback: () => void) => void;
};

/** Opens a step of the talks: the talks, if the interface shows them as waiting on an answer, or null. */
export type OpenTalksStep = (step: TalksStep) => OpenTalks | null;

export const talks = defineSlot<OpenTalksStep>('talks');

export default talks;
