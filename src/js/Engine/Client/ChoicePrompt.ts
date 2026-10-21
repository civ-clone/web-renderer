// Asking the player to choose (#449), moved out of `DataTransferClient.chooseFromList`: the choice is sent to the UI and
//  its answer listened for.
//
// Several prompts can be open at once (#491): a captured city's steal-advance choice and the talks the same move offers,
//  or a computer player's talks while ours are open. Each answer is the id of one of the choices offered, and those ids
//  are unique, so it goes to the prompt that offered it, whatever order the player answers them in. One listener serves
//  them all. It listens for one answer at a time, and again after each while any prompt is open. Before, a new prompt
//  stopped listening for the last one's answer, so that one never settled. If it was a step of the talks, every later
//  action waited for them for good.
//
// The client's `chooseFromList` answers first when it can without asking: automation's own client chooses for it, and
//  a choice of one is taken (except in talks, where the player sees each step).

import {
  ChoiceMeta,
  DataForChoiceMeta,
} from '@civ-clone/core-client/ChoiceMeta';
import Transport, { TransportDisposer } from '../Transport';
import { DataFilter } from './visibilityFilter';
import { standalone } from './refs';

// A prompt sent to the UI and not yet answered.
type OpenPrompt = {
  meta: ChoiceMeta<any>;
  // Chooses at random, for an answer that isn't one of the choices.
  fallback: () => Promise<any>;
  resolve: (value: any) => void;
};

export class ChoicePrompt {
  // What the player may see, which the choices are serialised through.
  #dataFilter: DataFilter;
  // The listener for the next answer, while any prompt is open, and what stops it.
  #listener: ((chosenId: string) => void) | null = null;
  #listenerDisposer: TransportDisposer | null = null;
  // The prompts open, in the order they were sent.
  #open: Set<OpenPrompt> = new Set();
  #transport: Transport<TransportDataMap>;

  constructor(transport: Transport<TransportDataMap>, dataFilter: DataFilter) {
    this.#transport = transport;
    this.#dataFilter = dataFilter;
  }

  // Stops listening for the answers to every prompt open: the client is done with (`dispose`), and their promises never
  //  settle.
  cancel(): void {
    this.#listenerDisposer?.();
    this.#listenerDisposer = null;
    this.#listener = null;
    this.#open.clear();
  }

  // Sends `meta` to the UI and resolves with the value of the choice it answers with, or with `fallback`'s if it
  //  answers with an id that isn't one of them while this is the only prompt open.
  promptChoice<Name extends keyof ChoiceMetaDataMap>(
    meta: ChoiceMeta<Name>,
    fallback: () => Promise<DataForChoiceMeta<ChoiceMeta<Name>>>
  ): Promise<DataForChoiceMeta<ChoiceMeta<Name>>> {
    return new Promise<DataForChoiceMeta<ChoiceMeta<Name>>>((resolve) => {
      // Serialised like a notification (#305). Sent whole, a negotiation's players brought every player's cities, units
      //  and known tiles: 20 MB and 10 s per step of a talk in a large game, and rivals' state the page should not see.
      //  Still the `ChoiceMeta` the transport expects, which a test's transport hands to an AI to answer; only what it
      //  serialises as changes.
      this.#transport.send(
        'chooseFromList',
        Object.create(meta, {
          toPlainObject: {
            value: () => meta.toPlainObject(this.#dataFilter(standalone)),
          },
        })
      );

      this.#open.add({ meta, fallback, resolve });

      this.#listen();
    });
  }

  // Listens for the next answer, unless something already is or no prompt is open.
  #listen(): void {
    if (this.#listener !== null || this.#open.size === 0) {
      return;
    }

    const listener = (chosenId: string): void => {
      if (this.#listener === listener) {
        this.#listener = null;
        this.#listenerDisposer = null;
      }

      this.#answer(chosenId);

      this.#listen();
    };

    this.#listener = listener;
    this.#listenerDisposer = this.#transport.receiveOnce(
      'chooseFromList',
      listener
    );
  }

  // Settles the prompt that offered `chosenId`.
  #answer(chosenId: string): void {
    for (const prompt of this.#open) {
      const [choice] = prompt.meta
        .choices()
        .filter((choice) => choice.id() === chosenId);

      if (choice) {
        this.#open.delete(prompt);

        prompt.resolve(choice.value());

        return;
      }
    }

    // Not one of the choices offered. With one prompt open, it can only be that one's answer, so it is chosen at random
    //  as before. With several, it can't be told whose it is.
    if (this.#open.size !== 1) {
      console.warn(
        `No choice found for '${chosenId}' against the ${
          this.#open.size
        } prompts open, ignored.`
      );

      return;
    }

    const [prompt] = this.#open;

    this.#open.delete(prompt);

    console.warn(
      `No choice found for '${chosenId}' against '${prompt.meta.id()}', using super.`
    );

    prompt.fallback().then(prompt.resolve);
  }
}

export default ChoicePrompt;
