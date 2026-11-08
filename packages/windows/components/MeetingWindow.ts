import { IntelligenceRow } from '@civ-clone/ui-protocol/reports';
import { NegotiationLine } from '@civ-clone/ui-client/lib/interactionLabels';
import { Window } from '@civ-clone/ui-widgets/components/Window';
import { button } from '@civ-clone/ui-widgets/lib/button';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { unlessRequestFailed } from '@civ-clone/ui-client/lib/unlessRequestFailed';

/** Who the player is meeting, already translated, set as text. */
export interface MeetingNation {
  // The engine's name for the civilization (`Roman`), to find its row in the intelligence the player has.
  civilization: string;
  leader: string;
  // The nation's name for a heading (`Romans`).
  nation: string;
}

/** One reply on offer, in the engine's order. */
export interface MeetingReply {
  // What `onChoose` is given.
  value: string;
  // What the player says, already translated, set as text.
  label: string;
  // Leaves the talks: Escape says it.
  leave?: boolean;
}

export interface MeetingWindowOptions {
  nation: MeetingNation;
  // The talks so far, oldest first: the last is what the player is answering.
  lines: NegotiationLine[];
  replies: MeetingReply[];
  onChoose: (value: string) => void;
  // What the player knows of every civilization they've met, for the strip under the header. Without it, or until it
  //  answers, the strip has only the names.
  intelligence?: Promise<IntelligenceRow[]> | null;
}

const year = (value: number): string =>
  t('GameDetails.year', {
    // There's no year 0: 1 CE.
    year: Math.abs(value) || 1,
    context: value < 0 ? 'bce' : 'ce',
  });

const fact = (label: string, value: string, tone: string | null = null) => {
  const item = s('<div class="ui-meeting-fact"></div>'),
    term = s('<dt></dt>'),
    detail = s('<dd></dd>');

  term.textContent = label;
  detail.textContent = value;

  if (tone !== null) {
    detail.dataset.tone = tone;
  }

  item.append(term, detail);

  return item;
};

/** What the player knows of them: peace or war, when they met, and with an embassy their government, cities and gold. */
const facts = (row: IntelligenceRow): HTMLElement[] => [
  fact(
    t('Meeting.relations'),
    t(`ReportTable.Intelligence.${row.atPeace ? 'peace' : 'war'}`),
    row.atPeace ? null : 'negative'
  ),
  ...(row.firstMet === null
    ? []
    : [fact(t('Meeting.first-met'), year(row.firstMet))]),
  ...(row.details === null
    ? []
    : [
        ...(row.details.government === null
          ? []
          : [
              fact(
                t('Meeting.government'),
                t(`${row.details.government}.name`, {
                  defaultValue: row.details.government,
                  ns: 'government',
                })
              ),
            ]),
        fact(
          t('Meeting.cities'),
          t('Meeting.count', { count: row.details.cities })
        ),
        fact(
          t('Meeting.treasury'),
          t('Meeting.gold', { count: row.details.gold })
        ),
      ]),
];

const line = ({ speaker, text, own }: NegotiationLine): HTMLElement => {
  // The scene, said by nobody: an emissary arriving, the hand-over.
  if (speaker === null) {
    const narration = s('<p class="ui-meeting-narration"></p>');

    narration.textContent = text;

    return narration;
  }

  const speech = s(
      `<figure class="ui-meeting-speech${
        own ? ' ui-meeting-speech-own' : ''
      }"></figure>`
    ),
    name = s('<figcaption></figcaption>'),
    quote = s('<blockquote></blockquote>');

  name.textContent = speaker;
  quote.textContent = text;
  speech.append(name, quote);

  return speech;
};

/**
 * A meeting with another leader under the new interface (#752): who they are and what the player knows of them in a
 *  strip under the header, the talks so far as a conversation, the last line being what the player answers, and the
 *  replies as a stack of buttons in the engine's order. The first is the default, and the engine offers the one that
 *  costs nothing first (#674), so Enter takes it; 1 to 9 take the others, and Escape leaves where leaving is a reply.
 */
export class MeetingWindow extends Window {
  #chosen: boolean = false;
  #conversation: HTMLElement;
  #default: HTMLButtonElement | null;
  #replies: HTMLButtonElement[];

  constructor(
    title: string,
    {
      nation,
      lines,
      replies,
      onChoose,
      intelligence = null,
    }: MeetingWindowOptions
  ) {
    const swatch = s(
        '<span class="ui-meeting-swatch" aria-hidden="true"></span>'
      ),
      leader = s('<strong class="ui-meeting-leader"></strong>'),
      nationName = s('<span class="ui-meeting-nation"></span>'),
      factList = s('<dl class="ui-meeting-facts"></dl>'),
      strip = s(
        '<div class="ui-meeting-strip"></div>',
        swatch,
        s('<div class="ui-meeting-who"></div>', leader, nationName),
        factList
      ),
      conversation = s(
        '<div class="ui-meeting-conversation" aria-live="polite"></div>',
        ...lines.map(line)
      ),
      choose = (value: string) => {
        if (this.#chosen) {
          return;
        }

        this.#chosen = true;
        this.close();
        onChoose(value);
      },
      // Numbered as they come: the keys are the numbers shown.
      buttons = replies.map(({ value, label, leave = false }, index) => {
        const reply = h(
          button('', {
            variant: index === 0 ? 'primary' : leave ? 'quiet' : 'secondary',
            hotkey: leave ? 'Escape' : null,
            className: 'ui-meeting-reply',
          }),
          { click: () => choose(value) }
        ) as HTMLButtonElement;

        if (index < 9) {
          const key = s(
            '<kbd class="ui-meeting-key" aria-hidden="true"></kbd>'
          );

          key.textContent = String(index + 1);
          reply.append(key);
          reply.setAttribute(
            'aria-keyshortcuts',
            leave ? `${index + 1} Escape` : String(index + 1)
          );
        }

        const text = s('<span class="ui-meeting-reply-text"></span>');

        text.textContent = label;
        reply.append(text);

        return reply;
      }),
      leave = replies.findIndex(({ leave }) => leave);

    leader.textContent = nation.leader;
    nationName.textContent = nation.nation;

    // The latest line is the one being answered.
    conversation.lastElementChild?.classList.add('ui-meeting-latest');

    super(
      title,
      s(
        '<div class="ui-meeting"></div>',
        strip,
        conversation,
        s(
          `<div class="ui-meeting-replies" role="group" aria-label="${t(
            'Meeting.replies'
          )}"></div>`,
          ...buttons
        )
      ),
      {
        autoDisplay: false,
        canClose: false,
        cancel: leave === -1 ? null : () => buttons[leave].click(),
        classes: ['negotiation', 'ui-meeting-window'],
      }
    );

    this.#conversation = conversation;
    this.#default = buttons[0] ?? null;
    this.#replies = buttons;

    // Ahead of the window's own keys, which take every key pressed in it.
    this.on('keydown', (event: KeyboardEvent) => {
      // A key held down answers one step, not every step after it: each window focuses its default, which the
      //  browser would otherwise press again.
      if (event.repeat) {
        event.preventDefault();
        // Escape too, which the window's own listener would otherwise take as Good bye.
        event.stopImmediatePropagation();

        return;
      }

      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const number = /^[1-9]$/.test(event.key) ? Number(event.key) : null;

      if (number !== null && this.#replies[number - 1]) {
        event.preventDefault();

        this.#replies[number - 1].click();

        return;
      }

      // On a reply, Enter is that reply's own; anywhere else in the window, the default's.
      if (
        event.key === 'Enter' &&
        this.#default !== null &&
        !(
          event.target instanceof Element &&
          event.target.closest('.ui-meeting-reply')
        )
      ) {
        event.preventDefault();

        this.#default.click();
      }
    });

    intelligence
      ?.then((rows) => {
        const row = rows.find(
          ({ civilization }) => civilization === nation.civilization
        );

        if (!row) {
          return;
        }

        if (row.colors) {
          swatch.style.setProperty('--owner-primary', row.colors[0]);
          swatch.style.setProperty('--owner-secondary', row.colors[1]);
        }

        factList.replaceChildren(...facts(row));
      })
      // Only the strip goes without: the talks go on.
      .catch(unlessRequestFailed);

    this.display();
  }

  display(focus?: boolean): void {
    super.display(focus);

    // Not before the replies are in: `Window` displays as it's made where it's asked to.
    if (!(#replies in this)) {
      return;
    }

    this.#conversation.scrollTop = this.#conversation.scrollHeight;
    this.#default?.focus();
  }

  /** The replies, in the order shown. */
  replies(): HTMLButtonElement[] {
    return this.#replies;
  }
}

export default MeetingWindow;
