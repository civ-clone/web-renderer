import { ObservedPlayer, ObserverState } from '../../Engine/Observer';
import { ObserverChoice } from '../../Engine/ObserverViews';
import Transport from '../Transport';
import { elementId, h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

const civilizationName = (name: string): string =>
    t(`${name}.name`, { defaultValue: name, ns: 'civilization' }),
  leaderName = (name: string): string =>
    t(`Leader.${name}.name`, { defaultValue: name, ns: 'civilization' });

/**
 * Watching a game nobody here plays (#607): what to see it as, and Play/Pause for the turns. The game is seen as one
 * or more of its civilisations see it, together, or as the whole map (#613): a radio for each way, and a checkbox per
 * civilisation. The worker sends `observer` whenever the players, the view or the pace change; this redraws from it.
 */
export class ObserverBar {
  #element: HTMLElement;
  #pace: HTMLButtonElement;
  #paused: boolean = false;
  #playerIds: string = '';
  // The civilisations last chosen, for the radio that brings them back.
  #lastChosen: string[] = [];
  #players: HTMLElement;
  #state: ObserverState | null = null;
  #status: HTMLElement;
  #transport: Transport;
  #worldRadio: HTMLInputElement;
  #playersRadio: HTMLInputElement;

  constructor(parent: HTMLElement, transport: Transport, state: ObserverState) {
    this.#transport = transport;
    this.#element = s('<div class="observer-bar" role="region"></div>');
    this.#worldRadio = s<HTMLInputElement>(
      '<input type="radio" name="observe-kind" value="world">'
    );
    this.#playersRadio = s<HTMLInputElement>(
      '<input type="radio" name="observe-kind" value="players">'
    );
    this.#players = s('<span class="players"></span>');
    this.#pace = h(
      s<HTMLButtonElement>('<button class="btn-secondary pace"></button>'),
      {
        click: () =>
          this.#transport.send(this.#paused ? 'resume' : 'pause', null),
      }
    );
    this.#status = s('<span class="status" role="status"></span>');

    h(this.#worldRadio, {
      change: () => this.#choose({ kind: 'world' }),
    });
    h(this.#playersRadio, {
      change: () =>
        this.#choose({
          kind: 'players',
          playerIds:
            this.#checked().length > 0 ? this.#checked() : this.#lastChosen,
        }),
    });

    this.#element.setAttribute('aria-label', t('Observer.title'));
    this.#element.append(
      s(
        `<fieldset class="view"><legend>${t(
          'Observer.view-as'
        )}</legend></fieldset>`,
        s(
          '<span class="kind"></span>',
          this.#worldRadio,
          s(
            `<label for="${elementId(this.#worldRadio)}">${t(
              'Observer.whole-map'
            )}</label>`
          )
        ),
        s(
          '<span class="kind"></span>',
          this.#playersRadio,
          s(
            `<label for="${elementId(this.#playersRadio)}">${t(
              'Observer.civilizations'
            )}</label>`
          ),
          this.#players
        )
      ),
      this.#pace,
      this.#status
    );
    parent.append(this.#element);

    this.update(state);
  }

  element(): HTMLElement {
    return this.#element;
  }

  update(state: ObserverState): void {
    this.#state = state;

    // The civilisations' checkboxes are made again only when the players change; a choice or a pause just sets what's
    //  there, so the control in use keeps the focus and the status line stays the one announced.
    const ids = state.players.map(({ id }) => id).join(',');

    if (ids !== this.#playerIds) {
      this.#playerIds = ids;
      this.#players.replaceChildren(
        ...state.players.map((player: ObservedPlayer): HTMLElement => {
          const input = s<HTMLInputElement>(
              `<input type="checkbox" name="observe-player" value="${player.id}">`
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
            change: () => {
              const checked = this.#checked();

              // At least one: the last left checked stays so.
              if (checked.length === 0) {
                input.checked = true;

                return;
              }

              this.#choose({ kind: 'players', playerIds: checked });
            },
          });

          return s('<span class="player"></span>', input, label);
        })
      );
    }

    const world = state.view.kind === 'world',
      chosen = state.view.kind === 'players' ? state.view.playerIds : [];

    if (!world) {
      this.#lastChosen = chosen;
    }

    this.#setChecked(this.#worldRadio, world);
    this.#setChecked(this.#playersRadio, !world);
    this.#players
      .querySelectorAll<HTMLInputElement>('input[name="observe-player"]')
      .forEach((input) =>
        this.#setChecked(input, chosen.includes(input.value))
      );

    this.#paused = state.paused;
    this.#pace.textContent = t(
      state.paused ? 'Observer.play' : 'Observer.pause'
    );
    this.#status.textContent = state.paused ? t('Observer.paused') : '';
  }

  #checked(): string[] {
    return Array.from(
      this.#players.querySelectorAll<HTMLInputElement>(
        'input[name="observe-player"]'
      )
    )
      .filter((input) => input.checked)
      .map((input) => input.value);
  }

  #choose(view: ObserverChoice): void {
    // Civilisations with none ticked: the first, so the choice means something.
    if (view.kind === 'players' && view.playerIds.length === 0) {
      const first = this.#state?.players[0];

      if (!first) {
        return;
      }

      view = { kind: 'players', playerIds: [first.id] };
    }

    this.#transport.send('observe', { view });
  }

  // The property for the page and the attribute for anything reading the markup.
  #setChecked(input: HTMLInputElement, checked: boolean): void {
    input.checked = checked;

    if (checked) {
      input.setAttribute('checked', '');
    } else {
      input.removeAttribute('checked');
    }
  }
}

export default ObserverBar;
