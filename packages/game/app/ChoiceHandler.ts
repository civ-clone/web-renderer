import {
  chooseFromListBody,
  chooseFromListChoice,
  chooseFromListTitle,
} from '@civ-clone/ui-client/lib/chooseFromList';
import {
  difficultyLabels,
  difficultyName,
  preselectedDifficulty,
  rememberDifficulty,
} from '@civ-clone/ui-client/lib/difficulty';
import { speakerOf } from '@civ-clone/ui-client/lib/interactionLabels';
import { Interactions, Negotiation } from '@civ-clone/ui-protocol/types';
import DebugFlags from '@civ-clone/ui-client/debug/DebugFlags';
import Transport from '@civ-clone/ui-client/Transport';
import entryDetails from '@civ-clone/ui-windows/components/lib/choiceDetails';
import { openChoice } from '@civ-clone/ui-windows/components/choiceList';
import talks from '@civ-clone/ui-windows/components/talks';
import { PendingMeeting } from '@civ-clone/ui-windows/components/NextTurn';
import { t } from 'i18next';

export interface ChoiceHandlerDeps {
  // Forgets the keys `PendingMove` kept while a move was being answered.
  clearKeys: () => void;
  // Talks waiting on the player's answer in the meeting window, for the Next Turn button (#702), and null once it's
  //  given.
  meeting?: (meeting: PendingMeeting | null) => void;
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

// The lists whose choices are advances.
const advanceKeys = [
  'capture-city.steal-advance',
  'diplomacy.exchange-knowledge',
];

// Every list the engine asks the player to choose from (`chooseFromList`): a step of the talks as the interface shows
//  it (`talks`), anything else as a list (`openChoice`), with Random among the civilizations (#15) and the difficulty
//  levels labelled and preselected (#173). The answer goes back on the same channel. Returns the disposer for
//  `Renderer`'s `transportDisposers`.
export const ChoiceHandler = {
  listen(
    transport: Transport,
    { clearKeys, debugFlags, meeting, sounds }: ChoiceHandlerDeps
  ): () => void {
    // The talks waiting on an answer, oldest first: more than one can wait at once, so the Next Turn button is given
    //  the latest still waiting, and null only once every one is answered.
    const meetings: PendingMeeting[] = [],
      publish = (): void => meeting?.(meetings[meetings.length - 1] ?? null);

    return transport.receive('chooseFromList', ({ choices, key, data }) => {
      // These talks' entry in `meetings`, once their window is open.
      let pending: PendingMeeting | null = null;

      // Off the Next Turn button: answered, or their window gone some other way.
      const answered = (): void => {
        if (pending === null) {
          return;
        }

        meetings.splice(meetings.indexOf(pending), 1);
        pending = null;
        publish();
      };

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
          // Answered: off the Next Turn button until the talks' next step, if there is one.
          answered();

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

      // A step of the talks, as the interface shows them (#860): its meeting window waits on an answer for the Next
      //  Turn button (#702).
      if (key === 'negotiation.next-step') {
        const open = talks.current()({
          title,
          choices,
          negotiation,
          us,
          reply,
          stressRunner: debugFlags.uiStressRunner ?? null,
          transport,
        });

        if (open !== null) {
          pending = { leader: open.leader, show: open.show };
          meetings.push(pending);
          publish();
          open.closed(answered);
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
