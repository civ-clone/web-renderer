// Automation (#449), moved out of `DataTransferClient`: whether the player's turns are played by the computer, and the
//  computer player that plays them. It is turned on and off mid-game (the Automate option, and `patchRefs` every
//  fourth turn), so whatever reads it holds this object and reads `enabled` as it goes, never a copy of it.

import AIClient from '@civ-clone/core-ai-client/AIClient';
import { ClientContext } from './ClientContext';

export type AutomationContext = Pick<
  ClientContext,
  | 'view'
  // Whose turn it is.
  | 'currentPlayers'
>;

export class Automation {
  // The computer player that plays our turns, and answers our choices, while automation is on.
  #client: AIClient;
  #context: AutomationContext;
  #enabled: boolean;

  constructor(client: AIClient, enabled: boolean, context: AutomationContext) {
    this.#client = client;
    this.#enabled = enabled;
    this.#context = context;
  }

  get client(): AIClient {
    return this.#client;
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = !!enabled;
  }

  // Whether it is our turn, automated or not: the primary player's, whose whole state goes at the end of it. Another
  //  owner's turn (a view of several, #613) isn't, so its moves are patched one by one.
  ourTurn(): boolean {
    const [currentPlayer] = this.#context.currentPlayers.entries();

    return currentPlayer === this.#context.view.primary();
  }

  // Whether this is our turn, automated: the whole player goes at the end of it, so what each of its moves changes of
  //  our units and cities needn't go as well, only the squares the map draws (#411).
  automatedTurn(): boolean {
    if (!this.#enabled) {
      return false;
    }

    return this.ourTurn();
  }
}

export default Automation;
