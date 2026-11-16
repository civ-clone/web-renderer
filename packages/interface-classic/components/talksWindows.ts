import {
  interactionLabel,
  negotiationLine,
} from '@civ-clone/ui-client/lib/interactionLabels';
import ActionWindow from '@civ-clone/ui-component-window/ActionWindow';
import { Interactions } from '@civ-clone/ui-protocol/types';
import { OpenTalksStep } from '@civ-clone/ui-hud/components/talks';
import instanceOf from '@civ-clone/ui-client/lib/instanceOf';
import { openChoice } from '@civ-clone/ui-hud/components/choiceList';
import { s } from '@dom111/element';
import { talksGroupLabel, talksMenu } from '@civ-clone/ui-client/lib/talksMenu';
import { t } from 'i18next';

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

// The classic talks: a step with one answer is the last thing said and what the player is about to say, each with who
//  says it, and Continue to say it (#751); one with several is a list, Good bye first, each saying what you'll say.
//  Neither stands waiting for the Next Turn button.
export const talksWindows: OpenTalksStep = ({
  title,
  choices,
  negotiation,
  us,
  reply,
  stressRunner,
}) => {
  const last = negotiation?.lastInteraction ?? null;

  if (choices.length === 1) {
    const window = new ActionWindow(
      title,
      negotiationLines([
        ...(last === null ? [] : [negotiationLine(last, us)]),
        negotiationLine(choices[0]!.value as Interactions, us),
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

    if (stressRunner) {
      stressRunner.automateChoice(window, choices[0]!.id, reply);
    } else {
      window.once('close', () => reply(choices[0]!.id));
    }

    return null;
  }

  // The menu of talks the player leads (Civ2's, M2d) lists the favours and the gifts under an entry of their own each,
  //  which opens their list, with Back to return. Choosing a group's entry isn't an answer: the list is opened again.
  const entries = talksMenu(goodbyeFirst(choices)),
    groupValue = (index: number): string => `@group-${index}`,
    intro = (): HTMLElement | null =>
      last === null ? null : negotiationLines([negotiationLine(last, us)]),
    open = (): void => {
      const talksWindow = openChoice(
        title,
        entries.map((entry, index) => {
          if ('group' in entry) {
            const label = talksGroupLabel(entry.group);

            return { label, value: groupValue(index), primary: label };
          }

          const label = interactionLabel(
            entry.choice.value as Interactions,
            true
          );

          return { label, value: entry.choice.id, primary: label };
        }),
        (choice) => {
          const group = entries.find(
            (entry, index) => 'group' in entry && groupValue(index) === choice
          );

          if (group !== undefined && 'group' in group) {
            openGroup(group.choices);

            return;
          }

          reply(choice);
        },
        {
          intro: intro(),
          canClose: false,
          classes: ['negotiation'],
          // The stress runner takes the engine's first choice, as an automated seat does, not Good bye (#502).
          // The engine offers at least one choice.
          chosen: stressRunner ? choices[0]!.id : null,
        }
      );

      if (stressRunner && !talksWindow.autoChosen()) {
        stressRunner.automateChoice(talksWindow, choices[0]!.id, reply);
      }
    },
    openGroup = (group: typeof choices): void => {
      const back = '@back';

      openChoice(
        title,
        [
          ...group.map(({ id, value }) => {
            const label = interactionLabel(value as Interactions, true);

            return { label, value: id, primary: label };
          }),
          {
            label: t('Negotiation.back'),
            value: back,
            primary: t('Negotiation.back'),
          },
        ],
        (choice) => (choice === back ? open() : reply(choice)),
        {
          intro: intro(),
          canClose: false,
          classes: ['negotiation'],
        }
      );
    };

  open();

  return null;
};

export default talksWindows;
