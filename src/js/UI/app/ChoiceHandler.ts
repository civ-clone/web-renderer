import {
  chooseFromListBody,
  chooseFromListChoice,
  chooseFromListTitle,
} from '../lib/chooseFromList';
import {
  difficultyLabels,
  difficultyName,
  preselectedDifficulty,
  rememberDifficulty,
} from '../lib/difficulty';
import { interactionLabel, negotiationLabel } from '../lib/interactionLabels';
import { Interactions, Negotiation } from '../types';
import ActionWindow from '../components/ActionWindow';
import DebugFlags from '../debug/DebugFlags';
import Transport from '../Transport';
import entryDetails from '../components/lib/choiceDetails';
import instanceOf from '../lib/instanceOf';
import { openChoice } from '../components/choiceList';
import { t } from 'i18next';

export interface ChoiceHandlerDeps {
  // Forgets the keys `PendingMove` kept while a move was being answered.
  clearKeys: () => void;
  // The same object `DebugPanel` writes: `uiStressRunner` and `stressUiWindowsEnabled` are read on every list, not
  //  copied when this starts listening.
  debugFlags: DebugFlags;
}

// A step of the talks lists Good bye first, so the option preselected, and taken by Enter, leaves the talks rather
//  than demanding tribute after a hand-over (#502). Only the list shown changes: the engine's order is the one an
//  automated seat picks from.
const goodbyeFirst = <Choice extends { value: unknown }>(
  choices: Choice[]
): Choice[] => [
  ...choices.filter(({ value }) =>
    instanceOf(value as Interactions, 'Terminate')
  ),
  ...choices.filter(
    ({ value }) => !instanceOf(value as Interactions, 'Terminate')
  ),
];

// The lists whose choices are advances.
const advanceKeys = [
  'capture-city.steal-advance',
  'diplomacy.exchange-knowledge',
];

// Every list the engine asks the player to choose from (`chooseFromList`): a step of the talks with one answer as an
//  `ActionWindow`, anything else as a list (`openChoice`), with Random among the civilizations (#15) and the difficulty
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

      // A step of the talks with several answers, Good bye first: each says what you'll say, as the button does.
      if (key === 'negotiation.next-step') {
        const talksWindow = openChoice(
          title,
          goodbyeFirst(choices).map(({ id, value }) => {
            const label = interactionLabel(value as Interactions, true);

            return { label, value: id, primary: label };
          }),
          (choice) => transport.send('chooseFromList', choice),
          {
            intro: negotiationLabel(data as Negotiation),
            canClose: false,
            classes: ['negotiation'],
            // The stress runner takes the engine's first choice, as an automated seat does, not Good bye (#502).
            chosen: debugFlags.uiStressRunner ? choices[0].id : null,
          }
        );

        if (debugFlags.uiStressRunner && !talksWindow.autoChosen()) {
          debugFlags.uiStressRunner.automateChoice(
            talksWindow,
            choices[0].id,
            (choiceId) => transport.send('chooseFromList', choiceId)
          );
        }

        return;
      }

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
          : null,
        preselected = difficulties
          ? choices[
              difficulties.findIndex(
                ({ name }) => name === preselectedDifficulty(difficulties)
              )
            ]?.id ?? null
          : null,
        // An advance offered (taken from a city, or in an exchange) is described as the Civilopedia describes it.
        advances = advanceKeys.includes(key);

      const selectionWindow = openChoice(
        title,
        [
          ...(offerRandom
            ? [
                {
                  label: t(`ChooseFromList.${key}.random`),
                  value: randomChoice,
                  primary: t(`ChoiceWindow.ChooseFromList.${key}.random`),
                },
              ]
            : []),
          ...choices.map(({ id, value }, index) => {
            const label = difficultyChoiceLabels
              ? difficultyChoiceLabels[index].label
              : chooseFromListChoice(key, value);

            return {
              label,
              value: id,
              primary: t(`ChoiceWindow.ChooseFromList.${key}.primary`, {
                // "Play at Prince level", "Play as the Romans".
                choice: difficulties
                  ? difficultyName(difficulties[index].name)
                  : key === 'choose-civilization'
                  ? t('Generic.civilization-name.plural', {
                      civilization: (value as { _: string })._,
                    })
                  : label,
                defaultValue: t('ChoiceWindow.choose'),
                interpolation: { escapeValue: false },
              }),
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
        {
          intro: chooseFromListBody(key, data),
          canClose: false,
          classes: [`choose-from-list`],
          // The stress runner takes the engine's first choice, as an automated seat does.
          chosen: debugFlags.uiStressRunner ? choices[0].id : preselected,
          describe: advances
            ? ({ value }) => {
                const advance = choices.find(({ id }) => id === value)
                  ?.value as { _: string } | undefined;

                return advance
                  ? entryDetails(transport, advance._, ['advance'])
                  : null;
              }
            : null,
        }
      );

      if (debugFlags.uiStressRunner && !selectionWindow.autoChosen()) {
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
