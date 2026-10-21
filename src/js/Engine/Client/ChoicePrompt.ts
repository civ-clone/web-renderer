// Asking the player to choose (#449), moved out of `DataTransferClient.chooseFromList`: the choice is sent to the UI and
//  its answer listened for once. One prompt is pending at a time per client: a new one stops listening for the last
//  one's answer (#491 records what that loses).
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

export class ChoicePrompt {
  // What the player may see, which the choices are serialised through.
  #dataFilter: DataFilter;
  #pendingChoiceDisposer: TransportDisposer | null = null;
  #transport: Transport<TransportDataMap>;

  constructor(transport: Transport<TransportDataMap>, dataFilter: DataFilter) {
    this.#transport = transport;
    this.#dataFilter = dataFilter;
  }

  // Stops listening for the answer to the prompt pending, if one is: the client is done with (`dispose`), and its
  //  promise never settles.
  cancel(): void {
    this.#pendingChoiceDisposer?.();
    this.#pendingChoiceDisposer = null;
  }

  // Sends `meta` to the UI and resolves with the value of the choice it answers with, or with `fallback`'s if it
  //  answers with an id that isn't one of them.
  promptChoice<Name extends keyof ChoiceMetaDataMap>(
    meta: ChoiceMeta<Name>,
    fallback: () => Promise<DataForChoiceMeta<ChoiceMeta<Name>>>
  ): Promise<DataForChoiceMeta<ChoiceMeta<Name>>> {
    return new Promise<DataForChoiceMeta<ChoiceMeta<Name>>>((resolve) => {
      // A listener stranded by an abandoned prompt would consume this
      // prompt's response (and retain its ChoiceMeta closure), so dispose it
      // before registering the next one.
      this.#pendingChoiceDisposer?.();

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

      this.#pendingChoiceDisposer = this.#transport.receiveOnce(
        'chooseFromList',
        async (chosenId) => {
          this.#pendingChoiceDisposer = null;

          const [choice] = meta
            .choices()
            .filter((choice) => choice.id() === chosenId);

          if (!choice) {
            console.warn(
              `No choice found for '${chosenId}' against '${meta.id()}', using super.`
            );

            resolve(await fallback());

            return;
          }

          resolve(choice.value());
        }
      );
    });
  }
}

export default ChoicePrompt;
