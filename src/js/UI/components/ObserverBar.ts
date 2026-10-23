import { ObservedPlayer, ObserverState } from '../../Engine/Observer';
import Transport from '../Transport';
import { elementId, h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

const civilizationName = (name: string): string =>
    t(`${name}.name`, { defaultValue: name, ns: 'civilization' }),
  leaderName = (name: string): string =>
    t(`Leader.${name}.name`, { defaultValue: name, ns: 'civilization' });

/**
 * Watching a game nobody here plays (#607): which player to see it as, and Play/Pause for the turns. The worker sends
 * `observer` whenever the players, the view or the pace change; this redraws from it.
 */
export class ObserverBar {
  #element: HTMLElement;
  #pace: HTMLButtonElement;
  #paused: boolean = false;
  #playerIds: string = '';
  #players: HTMLFieldSetElement;
  #status: HTMLElement;
  #transport: Transport;

  constructor(parent: HTMLElement, transport: Transport, state: ObserverState) {
    this.#transport = transport;
    this.#element = s('<div class="observer-bar" role="region"></div>');
    this.#players = s<HTMLFieldSetElement>(
      `<fieldset class="players"><legend>${t(
        'Observer.view-as'
      )}</legend></fieldset>`
    );
    this.#pace = h(s<HTMLButtonElement>('<button class="pace"></button>'), {
      click: () =>
        this.#transport.send(this.#paused ? 'resume' : 'pause', null),
    });
    this.#status = s('<span class="status" role="status"></span>');

    this.#element.setAttribute('aria-label', t('Observer.title'));
    this.#element.append(this.#players, this.#pace, this.#status);
    parent.append(this.#element);

    this.update(state);
  }

  element(): HTMLElement {
    return this.#element;
  }

  update(state: ObserverState): void {
    // The players' radios are made again only when the players change; a choice or a pause just sets what's there, so
    //  the control in use keeps the focus and the status line stays the one announced.
    const ids = state.players.map(({ id }) => id).join(',');

    if (ids !== this.#playerIds) {
      this.#playerIds = ids;
      this.#players.replaceChildren(
        ...state.players.map((player: ObservedPlayer): HTMLElement => {
          const input = s<HTMLInputElement>(
              `<input type="radio" name="observe" value="${player.id}">`
            ),
            label = s<HTMLLabelElement>(
              `<label for="${elementId(input)}"></label>`
            );

          label.textContent = t('Observer.player', {
            civilization: civilizationName(player.civilization),
            leader: player.leader === null ? '' : leaderName(player.leader),
            context: player.leader === null ? 'no-leader' : undefined,
          });

          h(input, {
            change: () =>
              this.#transport.send('observe', { playerId: player.id }),
          });

          return s('<span class="player"></span>', input, label);
        })
      );
    }

    this.#players
      .querySelectorAll<HTMLInputElement>('input[name="observe"]')
      .forEach((input) => {
        input.checked = input.value === state.viewing;

        if (input.checked) {
          input.setAttribute('checked', '');
        } else {
          input.removeAttribute('checked');
        }
      });

    this.#paused = state.paused;
    this.#pace.textContent = t(
      state.paused ? 'Observer.play' : 'Observer.pause'
    );
    this.#status.textContent = state.paused ? t('Observer.paused') : '';
  }
}

export default ObserverBar;
