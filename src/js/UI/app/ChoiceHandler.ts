import {
  chooseFromListBody,
  chooseFromListChoice,
  chooseFromListTitle,
} from '../lib/chooseFromList';
import {
  difficultyLabels,
  preselectedDifficulty,
  rememberDifficulty,
} from '../lib/difficulty';
import { interactionLabel, negotiationLabel } from '../lib/interactionLabels';
import { Interactions, Negotiation } from '../types';
import ActionWindow from '../components/ActionWindow';
import DebugFlags from '../debug/DebugFlags';
import SelectionWindow from '../components/SelectionWindow';
import Transport from '../Transport';
import { t } from 'i18next';

export interface ChoiceHandlerDeps {
  // Forgets the keys `PendingMove` kept while a move was being answered.
  clearKeys: () => void;
  // The same object `DebugPanel` writes: `uiStressRunner` and `stressUiWindowsEnabled` are read on every list, not
  //  copied when this starts listening.
  debugFlags: DebugFlags;
}

// Every list the engine asks the player to choose from (`chooseFromList`): a step of the talks with one answer as an
//  `ActionWindow`, anything else as a `SelectionWindow`, with Random among the civilizations (#15) and the difficulty
//  levels labelled and preselected (#173). The answer goes back on the same channel. Returns the disposer for
//  `Renderer`'s `transportDisposers`.
export const ChoiceHandler = {
  listen(
    transport: Transport,
    { clearKeys, debugFlags }: ChoiceHandlerDeps
  ): () => void {
    return transport.receive('chooseFromList', ({ choices, key, data }) => {
      // The worker waits for this before it answers the action that asked
      // (talks a move started, say), so the window can close before the
      // move's answer arrives: the keys kept while it was answered were
      // typed without knowing it would be there. The move stays drawn
      // ahead until its answer (#326).
      clearKeys();

      if (
        debugFlags.uiStressRunner &&
        !debugFlags.stressUiWindowsEnabled &&
        choices.length > 0 &&
        debugFlags.uiStressRunner.isAutomatingChoice(choices[0].id)
      ) {
        transport.send('chooseFromList', choices[0].id);

        return;
      }

      const title = chooseFromListTitle(key, data);

      if (key === 'negotiation.next-step' && choices.length === 1) {
        const window = new ActionWindow(
          title,
          negotiationLabel(data as Negotiation),
          {
            canClose: false,
            actions: {
              primary: {
                label: interactionLabel(choices[0].value as Interactions, true),
                action: (actionWindow) => actionWindow.close(),
              },
            },
          }
        );

        window.on('keydown', (event) => {
          if (event.key !== 'Enter') {
            return;
          }

          window.close();

          event.preventDefault();
          event.stopPropagation();
        });

        if (debugFlags.uiStressRunner) {
          debugFlags.uiStressRunner.automateChoice(
            window,
            choices[0].id,
            (choiceId) => transport.send('chooseFromList', choiceId)
          );
        } else {
          window.once('close', () =>
            transport.send('chooseFromList', choices[0].id)
          );
        }

        return;
      }

      const body =
        key === 'negotiation.next-step'
          ? negotiationLabel(data as Negotiation)
          : chooseFromListBody(key, data);

      // Picked client-side, among the choices offered (#15). Not a valid choice id, so it can't collide with one.
      const randomChoice = '@random',
        offerRandom = key === 'choose-civilization' && choices.length > 1,
        // A save from before there were levels (#173): labelled and preselected as the new game menu does it. The
        //  engine sends the levels easiest first.
        difficulties =
          key === 'choose-difficulty'
            ? choices.map(({ value }, level) => ({
                name: (value as { _: string })._,
                level,
              }))
            : null,
        difficultyChoiceLabels = difficulties
          ? difficultyLabels(difficulties)
          : null;

      const selectionWindow = new SelectionWindow(
        title,
        [
          ...(offerRandom
            ? [
                {
                  label: t(`ChooseFromList.${key}.random`),
                  value: randomChoice,
                },
              ]
            : []),
          ...choices.map(({ id, value }, index) => {
            const label =
              key === 'negotiation.next-step'
                ? interactionLabel(value as Interactions, true)
                : difficultyChoiceLabels
                ? difficultyChoiceLabels[index].label
                : chooseFromListChoice(key, value);

            return {
              label,
              value: id,
            };
          }),
        ],
        (choice) => {
          if (difficulties) {
            const chosen = choices.findIndex(({ id }) => id === choice);

            if (chosen > -1) {
              rememberDifficulty(difficulties[chosen].name);
            }
          }

          transport.send(
            'chooseFromList',
            offerRandom && choice === randomChoice
              ? choices[Math.floor(Math.random() * choices.length)].id
              : choice
          );
        },
        body,
        {
          canClose: false,
          displayAll: true,
        }
      );

      if (difficulties && !selectionWindow.autoChosen()) {
        const preselected = preselectedDifficulty(difficulties),
          preselectedIndex = difficulties.findIndex(
            ({ name }) => name === preselected
          );

        if (preselectedIndex > -1) {
          selectionWindow.selectionList().value = choices[preselectedIndex].id;
        }
      }

      if (debugFlags.uiStressRunner && !selectionWindow.autoChosen()) {
        selectionWindow.selectionList().value = choices[0].id;
        debugFlags.uiStressRunner.automateChoice(
          selectionWindow,
          choices[0].id,
          (choiceId) => transport.send('chooseFromList', choiceId)
        );
      }
    });
  },
};

export default ChoiceHandler;
