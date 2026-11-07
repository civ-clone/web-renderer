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
import {
  interactionLabel,
  negotiationLine,
  playerName,
  speakerOf,
} from '../lib/interactionLabels';
import { Interactions, Negotiation } from '../types';
import ActionWindow from '../components/ActionWindow';
import DebugFlags from '../debug/DebugFlags';
import Intelligence from '../../Engine/Requests/Intelligence';
import MeetingWindow from '../components/MeetingWindow';
import Transport from '../Transport';
import entryDetails from '../components/lib/choiceDetails';
import instanceOf from '../lib/instanceOf';
import { hasFeature } from '../lib/interfaceMode';
import { openChoice } from '../components/choiceList';
import { s } from '@dom111/element';
import { t } from 'i18next';

export interface ChoiceHandlerDeps {
  // Forgets the keys `PendingMove` kept while a move was being answered.
  clearKeys: () => void;
  // The same object `DebugPanel` writes: `uiStressRunner` and `stressUiWindowsEnabled` are read on every list, not
  //  copied when this starts listening.
  debugFlags: DebugFlags;
  // The talks' music (#126): told of each step shown and of the reply to it. Structural, as `lib/eventSounds.ts`'s
  //  `EventSounds` is made with the page's music, which this doesn't import.
  sounds?: {
    negotiationStep(negotiation: Negotiation): void;
    talksContinued(): void;
    negotiationReplied(reply: Interactions | null): void;
  };
}

// A step of the talks lists Good bye first, so the option preselected, and taken by Enter, leaves the talks rather
//  than demanding tribute after a hand-over (#502). Only the list shown changes: the engine's order is the one an
//  automated seat picks from.
// The lines of the talks, each with who said it, set as text (#751).
const negotiationLines = (
  lines: { speaker: string | null; text: string }[]
): HTMLElement =>
  s(
    '<div class="negotiation-lines"></div>',
    ...lines.map(({ speaker, text }) => {
      const line = s('<p class="negotiation-line"></p>');

      if (speaker !== null) {
        const name = document.createElement('strong');

        name.textContent = t('Negotiation.speaker', { speaker });
        line.append(name, ' ');
      }

      line.append(text);

      return line;
    })
  );

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
    { clearKeys, debugFlags, sounds }: ChoiceHandlerDeps
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

      // A step of the talks is heard as it's shown, and the reply as it's sent (#126).
      // The choices the talks make along the way (the advance to take in an exchange) are part of them too.
      const inTalks =
        key === 'negotiation.next-step' || key.startsWith('diplomacy.');

      if (key === 'negotiation.next-step' && data) {
        sounds?.negotiationStep(data as Negotiation);
      } else if (inTalks) {
        sounds?.talksContinued();
      }

      const reply = (choiceId: string): void => {
        if (key === 'negotiation.next-step') {
          sounds?.negotiationReplied(
            (choices.find(({ id }) => id === choiceId)?.value as
              | Interactions
              | undefined) ?? null
          );
        } else if (inTalks) {
          sounds?.negotiationReplied(null);
        }

        transport.send('chooseFromList', choiceId);
      };

      // The talks so far, from the player's side: they are whoever their answers are by. A step whose answers aren't all
      //  by one player can't say which is theirs, so it names everyone (#751).
      const negotiation = data as Negotiation | null,
        last = negotiation?.lastInteraction ?? null,
        speakers =
          key === 'negotiation.next-step'
            ? choices.map(({ value }) => speakerOf(value as Interactions))
            : [],
        us =
          speakers.length > 0 &&
          speakers[0]?.id !== undefined &&
          speakers.every((speaker) => speaker?.id === speakers[0]?.id)
            ? speakers[0]
            : null;

      // With the meeting window (#752): the talks so far, and the replies in the engine's order, the
      //  one that costs nothing first (#674).
      if (key === 'negotiation.next-step' && hasFeature('meetingWindow')) {
        // The stress runner as the window opens: the one that answers it, if any, however the panel changes meanwhile.
        const stressRunner = debugFlags.uiStressRunner,
          players = negotiation?.players ?? [],
          them =
            players.find((player) => player.id !== us?.id) ??
            players[0] ??
            null,
          meetingWindow = new MeetingWindow(
            them === null
              ? title
              : t('Meeting.title', { leader: playerName(them) }),
            {
              nation: {
                civilization: them?.civilization?._ ?? '',
                leader: them === null ? '' : playerName(them),
                nation:
                  them === null
                    ? ''
                    : t('Generic.civilization-name.plural', {
                        civilization: them.civilization?._,
                        player: them,
                      }),
              },
              lines: (
                negotiation?.interactions ?? (last === null ? [] : [last])
              ).map((interaction) => negotiationLine(interaction, us)),
              replies: choices.map(({ id, value }) => ({
                value: id,
                label: interactionLabel(value as Interactions, true),
                leave: instanceOf(value as Interactions, 'Terminate'),
              })),
              // The stress runner sends its own answer, whatever is chosen in the window meanwhile.
              onChoose: (choice) => {
                if (!stressRunner) {
                  reply(choice);
                }
              },
              intelligence: transport.request(new Intelligence()),
            }
          );

        if (stressRunner) {
          stressRunner.automateChoice(meetingWindow, choices[0].id, reply);
        }

        return;
      }

      // One answer: the last thing said and what the player is about to say, each with who says it, and Continue to
      //  say it (#751).
      if (key === 'negotiation.next-step' && choices.length === 1) {
        const window = new ActionWindow(
          title,
          negotiationLines([
            ...(last === null ? [] : [negotiationLine(last, us)]),
            negotiationLine(choices[0].value as Interactions, us),
          ]),
          {
            canClose: false,
            actions: {
              primary: {
                label: t('Negotiation.continue'),
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
            reply
          );
        } else {
          window.once('close', () => reply(choices[0].id));
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
          (choice) => reply(choice),
          {
            intro:
              last === null
                ? null
                : negotiationLines([negotiationLine(last, us)]),
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
            reply
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

          reply(
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
          (choiceId) => reply(choiceId)
        );
      }
    });
  },
};

export default ChoiceHandler;
