import { Player, PlayerAction } from '@civ-clone/ui-protocol/types';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import { TransportTranslatedNotice } from '@civ-clone/ui-protocol/Transport';
import { defineSlot } from '@civ-clone/ui-platform/lib/interfaceMode';

// The interface's `turnControls` slot (#860): what fills the end-turn area with the player's actions, and ends the
//  turn. The classic interface has its orbs; the modern one the notification rows over the Next Turn button (#416,
//  #702).

/** Talks the engine is waiting on an answer to (#702): who they're with, and how to bring their window back. */
export type PendingMeeting = { leader: string; show: () => void };

/** A single control for the turn, which Enter presses and Shift+Enter skips (`InputController`). */
export type NextTurnControl = {
  /** Whether talks are waiting on the player's answer: Enter presses it for them even while waiting. */
  hasMeeting(): boolean;
  /** Talks waiting on the player's answer, or null once it's given. */
  meeting(meeting: PendingMeeting | null): void;
  /** Does what it says. */
  press(): void;
  /** Moves on to what's next. */
  skip(): void;
  /** Whose turn it is while waiting (#588), or null once it's the player's again. */
  waitingFor(notice: TransportTranslatedNotice | null): void;
};

export type TurnControlsDeps = {
  // The map centred on the active unit.
  centreActiveUnit: () => void;
  // An action dismissed for the turn (#416): the HUD keeps which, and draws again.
  dismiss: (action: PlayerAction) => void;
  portal: Portal;
  transport: Transport;
};

export type TurnControlsState = {
  // The end-turn area's actions, in priority order, with the page's notices (`partitionActions`).
  primary: PlayerAction[];
  // Those of them the player hasn't dismissed this turn (#416).
  kept: PlayerAction[];
  // All of the player's actions.
  actions: PlayerAction[];
  waiting: boolean;
  player: Player;
  // The game's turn.
  turn: number;
};

export interface TurnControls {
  /** Draws the controls from the latest data. */
  build(state: TurnControlsState): void;
  /** The control Enter presses, if the interface has one. */
  nextTurn(): NextTurnControl | null;
}

export const turnControls =
  defineSlot<(actionArea: HTMLElement, deps: TurnControlsDeps) => TurnControls>(
    'turnControls'
  );

export default turnControls;
