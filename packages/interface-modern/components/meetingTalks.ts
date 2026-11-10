import {
  interactionLabel,
  negotiationLine,
  playerName,
} from '@civ-clone/ui-client/lib/interactionLabels';
import { Interactions } from '@civ-clone/ui-protocol/types';
import Intelligence from '@civ-clone/ui-protocol/Requests/Intelligence';
import MeetingWindow from './MeetingWindow';
import { OpenTalksStep } from '@civ-clone/ui-windows/components/talks';
import instanceOf from '@civ-clone/ui-client/lib/instanceOf';
import { t } from 'i18next';

// The talks in the meeting window (#752): the talks so far, and the replies in the engine's order, the one that costs
//  nothing first (#674). Waiting on an answer, for the Next Turn button (#702).
export const meetingTalks: OpenTalksStep = ({
  title,
  choices,
  negotiation,
  us,
  reply,
  stressRunner,
  transport,
}) => {
  const last = negotiation?.lastInteraction ?? null,
    players = negotiation?.players ?? [],
    them = players.find((player) => player.id !== us?.id) ?? players[0] ?? null,
    meetingWindow = new MeetingWindow(
      them === null ? title : t('Meeting.title', { leader: playerName(them) }),
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
        lines: (negotiation?.interactions ?? (last === null ? [] : [last])).map(
          (interaction) => negotiationLine(interaction, us)
        ),
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

  return {
    leader:
      them === null ? t('Generic.unknown-civilization') : playerName(them),
    show: (): void => meetingWindow.display(true),
    closed: (callback): void => {
      meetingWindow.once('close', callback);
    },
  };
};

export default meetingTalks;
