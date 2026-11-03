import {
  Dialogue,
  DiplomacyAction,
  Interactions,
  Player,
  Resolution,
} from '../types';
import instanceOf from './instanceOf';
import { t } from 'i18next';

// What a step of the talks with another leader says, and what each of the player's answers to it says. Used by the
//  `chooseFromList` receiver (`app/ChoiceHandler.ts`).

// The wording can depend on what kind of proposal it is (a demand for gold or for an advance, say) and on whether
//  it's one of our own choices (#427). i18next's `context` picks `key_own-gold`, or failing that `key` itself: it does
//  not try `key_gold` on the way, so one of our own choices that reads differently for each kind needs a key for each.
export const interactionContext = (
    interaction: Interactions,
    own: boolean
  ): string | undefined => {
    const kind =
      (interaction as { kind?: string }).kind ??
      (interaction as { proposal?: { kind?: string } }).proposal?.kind;

    return (
      [own ? 'own' : null, kind ?? null]
        .filter((part) => part !== null)
        .join('-') || undefined
    );
  },
  interactionLabel = (interaction: Interactions, own = false) => {
    const context = interactionContext(interaction, own);

    if (instanceOf(interaction, 'Dialogue')) {
      return t(`${interaction._}.${(interaction as Dialogue).key}`, {
        interaction,
        defaultValue: interaction._,
        ns: 'diplomacy',
      });
    }

    if (instanceOf(interaction, 'Proposal')) {
      return t(interaction._, {
        context,
        interaction,
        defaultValue: interaction._,
        ns: 'diplomacy',
      });
    }

    if (instanceOf(interaction, 'Resolution')) {
      const { proposal } = interaction as Resolution;

      return t(`Resolution.${proposal._}.${interaction._}`, {
        context,
        interaction,
        defaultValue: interaction._,
        ns: 'diplomacy',
      });
    }

    return t(`Action.${interaction._}`, {
      interaction,
      defaultValue: interaction._,
      ns: 'diplomacy',
    });
  },
  /**
   * Who said `interaction`: an action's, a proposal's or a dialogue's `by`, or, for a resolution, the player the
   *  proposal was made to, who is the one answering it (#751). `null` when it can't be told.
   */
  speakerOf = (interaction: Interactions | null): Player | null => {
    if (interaction === null) {
      return null;
    }

    if (instanceOf(interaction, 'Resolution')) {
      return (interaction as Resolution).proposal?.for?.[0] ?? null;
    }

    return (interaction as DiplomacyAction).by ?? null;
  },
  /** A line of the talks: who said it, `You` for `us`, and what they said, in our own words where it's ours. */
  negotiationLine = (
    interaction: Interactions,
    us: Player | null
  ): { speaker: string | null; text: string } => {
    const speaker = speakerOf(interaction),
      own = us !== null && speaker !== null && speaker.id === us.id;

    return {
      speaker:
        speaker === null
          ? null
          : own
          ? t('Negotiation.you')
          : speaker.civilization?.leader
          ? t('Generic.leader-name', {
              leader: speaker.civilization.leader._,
              player: speaker,
            })
          : t('Generic.civilization-name.plural', {
              civilization: speaker.civilization?._,
              player: speaker,
            }),
      text: interactionLabel(interaction, own),
    };
  };
