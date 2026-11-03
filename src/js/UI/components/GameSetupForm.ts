import GameSetup, {
  FinishedHandler,
  GameSetupPreset,
  RANDOM,
  SeatKind,
  SeatState,
  SetupData,
  requestSetupData,
} from '../lib/gameSetup';
import {
  cell,
  civilizationName,
  leaderName,
  option,
  select,
} from '../lib/setupControls';
import { difficultyLabels, preselectedDifficulty } from '../lib/difficulty';
import { elementId, h } from '../lib/html';
import { TopologyId } from '../lib/topologyFor';
import Transport from '../Transport';
import Window from './Window';
import button from '../lib/button';
import { glyph } from '../lib/glyphs';
import { s } from '@dom111/element';
import { supportedTopologies } from '../lib/supportedTopologies';
import { t } from 'i18next';

// Each seat's kind, in the order the toggle shows them.
const kinds: SeatKind[] = ['human', 'computer'];

// A field: its label, the control, and a muted line under it or a unit after it.
const field = (
  label: string,
  control: HTMLElement,
  {
    hint = null,
    unit = null,
  }: { hint?: HTMLElement | null; unit?: string | null } = {}
): HTMLElement =>
  s(
    `<div class="ui-field"><label for="${elementId(
      control
    )}">${label}</label></div>`,
    s(
      '<div class="ui-field-control"></div>',
      control,
      ...(unit === null
        ? []
        : [s(`<span class="ui-field-unit">${unit}</span>`)])
    ),
    ...(hint === null ? [] : [hint])
  );

const numberInput = (
  name: string,
  value: unknown,
  attributes: string
): HTMLInputElement =>
  s<HTMLInputElement>(
    `<input name="${name}" type="number" value="${value}" ${attributes}>`
  );

/** A civilization's colours as a swatch, or a neutral one while it's left to chance. */
export const civilizationSwatch = (colours: string[] | null): HTMLElement => {
  const swatch = s('<span class="ui-civ-swatch" aria-hidden="true"></span>');

  if (colours === null || colours.length === 0) {
    swatch.classList.add('random');

    return swatch;
  }

  // The civilization's own colours, which are data, not the theme's.
  swatch.style.setProperty('--swatch-first', colours[0]);
  swatch.style.setProperty('--swatch-second', colours[1] ?? colours[0]);

  return swatch;
};

/**
 * The game setup under the new interface (#750): the world as labelled fields, the difficulty with a line on what
 *  it means, and the seats, each with its civilization's colours, a Human / Computer toggle and a quiet Remove. Start
 *  is the footer's primary. Only the seats scroll. `GameSetupWindow` is the classic one.
 */
export class GameSetupForm extends Window {
  #onFinished?: FinishedHandler;
  #setup: GameSetup;
  #transport: Transport;

  #addSeat!: HTMLButtonElement;
  #difficultySelect!: HTMLSelectElement;
  #difficultyHint!: HTMLElement;
  #gridSelect!: HTMLSelectElement;
  #heightInput!: HTMLInputElement;
  #landInputs: HTMLInputElement[] = [];
  #mapSelect!: HTMLSelectElement;
  #seatsBody!: HTMLTableSectionElement;
  #seatsNote!: HTMLElement;
  #widthInput!: HTMLInputElement;

  constructor(
    transport: Transport,
    data: SetupData,
    onFinished?: FinishedHandler,
    preset: GameSetupPreset = {}
  ) {
    super(t('GameSetup.title'), s('<div class="ui-game-setup"></div>'), {
      classes: ['game-setup-window', 'ui-game-setup-window'],
      modal: true,
    });

    this.#onFinished = onFinished;
    this.#setup = new GameSetup(data, preset);
    this.#transport = transport;

    this.#build(preset);
  }

  /** Asks the worker what there is to choose from, then shows the form. */
  static async ask(
    transport: Transport,
    onFinished?: FinishedHandler,
    preset: GameSetupPreset = {}
  ): Promise<GameSetupForm> {
    return new GameSetupForm(
      transport,
      await requestSetupData(transport),
      onFinished,
      preset
    );
  }

  /** The seats a game has, as the form holds them. */
  seats(): SeatState[] {
    return this.#setup.seats.map((seat) => ({ ...seat }));
  }

  #build(preset: GameSetupPreset): void {
    const setup = this.#setup,
      data = setup.data,
      grids = supportedTopologies(),
      advanced = s<HTMLDetailsElement>(
        `<details class="ui-game-setup-advanced"${
          preset.advanced ? ' open' : ''
        }></details>`,
        s(`<summary>${t('GameSetup.advanced')}</summary>`)
      ),
      // Made, not parsed: `s()` parses inside a `<div>`, where a browser drops a bare `<thead>` or `<tr>`.
      table = document.createElement('table'),
      head = document.createElement('thead'),
      headRow = document.createElement('tr');

    table.className = 'ui-game-setup-seats';
    headRow.append(
      ...[
        'GameSetup.seat',
        'GameSetup.kind',
        'GameSetup.name',
        'GameSetup.civilization',
        'GameSetup.leader',
        ...(data.aiClients.length > 1 ? ['GameSetup.ai'] : []),
        '',
      ].map((key) => {
        const heading = document.createElement('th');

        heading.scope = 'col';
        heading.textContent = key ? t(key) : '';

        return heading;
      })
    );
    head.append(headRow);
    this.#seatsBody = document.createElement('tbody');
    table.append(head, this.#seatsBody);

    this.#gridSelect = select(
      'topologyId',
      grids.map((grid) =>
        option(grid, t(`Grid.${grid}`), {
          selected: grid === setup.topologyId,
        })
      )
    );
    this.#mapSelect = select('map', []);
    this.#difficultySelect = select(
      'difficulty',
      difficultyLabels(data.difficulties).map(({ label, value }) =>
        option(value, label, {
          selected: value === preselectedDifficulty(data.difficulties),
        })
      )
    );
    this.#difficultyHint = s('<p class="ui-field-hint"></p>');
    this.#widthInput = numberInput('width', setup.width, 'step="1" min="1"');
    this.#heightInput = numberInput('height', setup.height, 'step="1" min="1"');
    this.#landInputs = [
      numberInput(
        'landCoverage',
        data.existing.landCoverage ?? 0.4,
        'step="0.01" min="0"'
      ),
      numberInput(
        'landSize',
        data.existing.landSize ?? 0.2,
        'step="0.01" min="0"'
      ),
      numberInput(
        'maxIterations',
        data.existing.maxIterations ?? 20,
        'step="1" min="1"'
      ),
    ];
    this.#seatsNote = s('<p class="ui-game-setup-note"></p>');
    this.#addSeat = h(
      button(t('GameSetup.add-seat'), { className: 'ui-game-setup-add' }),
      {
        click: () => {
          setup.addSeat();

          this.#renderSeats();
        },
      }
    );

    h(this.#gridSelect, {
      change: () => {
        setup.chooseGrid(this.#gridSelect.value as TopologyId);

        this.#renderMap();
      },
    });
    h(this.#mapSelect, {
      change: () => {
        setup.chooseMap(this.#mapSelect.value);

        this.#renderMap();
      },
    });
    h(this.#difficultySelect, {
      change: () => this.#renderDifficulty(),
    });

    // A size typed in is a custom world: the map says so, and the seats keep whatever room there is.
    [this.#widthInput, this.#heightInput].forEach((input) =>
      h(input, {
        input: () => {
          input.setCustomValidity('');

          setup.setCustomSize(
            Number(this.#widthInput.value),
            Number(this.#heightInput.value)
          );

          this.#renderMap();
        },
      })
    );

    advanced.append(
      s(
        '<div class="ui-game-setup-fields"></div>',
        ...(
          [
            [
              this.#widthInput,
              'CustomizeWorld.width',
              'GameSetup.unit-squares',
            ],
            [
              this.#heightInput,
              'CustomizeWorld.height',
              'GameSetup.unit-squares',
            ],
            [
              this.#landInputs[0],
              'CustomizeWorld.land-coverage',
              'GameSetup.unit-share',
            ],
            [this.#landInputs[1], 'CustomizeWorld.land-size', null],
            [
              this.#landInputs[2],
              'CustomizeWorld.max-iterations',
              'GameSetup.unit-passes',
            ],
          ] as [HTMLInputElement, string, string | null][]
        ).map(([input, label, unit]) =>
          field(t(label), input, { unit: unit === null ? null : t(unit) })
        )
      )
    );

    this.update(
      s(
        '<div class="ui-game-setup"></div>',
        s(
          '<section class="ui-game-setup-world"></section>',
          ...(grids.length > 1
            ? [field(t('GameSetup.grid'), this.#gridSelect)]
            : []),
          field(t('GameSetup.map'), this.#mapSelect),
          field(t('GameSetup.difficulty'), this.#difficultySelect, {
            hint: this.#difficultyHint,
          }),
          advanced
        ),
        s(
          '<section class="ui-game-setup-seating"></section>',
          s(
            '<div class="ui-game-setup-seats-heading"></div>',
            s(`<h4>${t('GameSetup.seats')}</h4>`),
            this.#seatsNote
          ),
          s('<div class="ui-game-setup-table"></div>', table),
          this.#addSeat
        ),
        // Moved into the window's footer, Start as its primary (#738).
        s(
          '<footer></footer>',
          h(
            button(t('GameSetup.start'), {
              variant: 'primary',
              className: 'start',
            }),
            {
              click: () => this.#start(),
            }
          )
        )
      )
    );

    this.#renderMap();
    this.#renderDifficulty();

    this.on('keydown', (event) => {
      // Not from a select, a button, a toggle or the Advanced summary, which Enter works, nor mid-composition.
      if (
        event.key === 'Enter' &&
        !event.repeat &&
        !event.isComposing &&
        !(event.target instanceof HTMLSelectElement) &&
        !(event.target instanceof HTMLButtonElement) &&
        !(
          event.target instanceof HTMLInputElement &&
          event.target.type === 'radio'
        ) &&
        !(
          event.target instanceof HTMLElement && event.target.closest('summary')
        )
      ) {
        void this.#start();

        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  // What the chosen level is, in a line: nothing for a level the translations don't describe.
  #renderDifficulty(): void {
    const name = this.#difficultySelect.value;

    this.#difficultyHint.textContent = name
      ? t(`GameSetup.difficulty-summary.${name}`, { defaultValue: '' })
      : '';
    this.#difficultyHint.hidden = this.#difficultyHint.textContent === '';
  }

  // The map list, grouped: this grid's sizes, Earth's, and the custom size when one is typed. Earth is square only,
  //  and its land is the map's, so those fields are held while it's chosen.
  #renderMap(): void {
    const setup = this.#setup,
      current = setup.map(),
      groups = new Map<string, HTMLElement>();

    setup.maps().forEach(({ value, label, group }) => {
      if (!groups.has(group)) {
        const element = document.createElement('optgroup');

        element.label = t(`GameSetup.map-group.${group}`);
        groups.set(group, element);
      }

      groups
        .get(group)!
        .append(option(value, label, { selected: value === current }));
    });

    this.#mapSelect.replaceChildren(...groups.values());
    this.#gridSelect.value = setup.topologyId;
    this.#gridSelect.disabled = setup.earth;
    [this.#widthInput, this.#heightInput, ...this.#landInputs].forEach(
      (input) => (input.disabled = setup.earth)
    );

    if (document.activeElement !== this.#widthInput) {
      this.#widthInput.value = String(setup.width);
    }

    if (document.activeElement !== this.#heightInput) {
      this.#heightInput.value = String(setup.height);
    }

    this.#renderSeats();
  }

  #renderSeats(): void {
    const setup = this.#setup,
      // The rows are rebuilt, so whatever had the focus is put back by its row and control: the toggle by its checked
      //  radio, which the arrow keys have just moved to, and anything else by its name.
      active = document.activeElement,
      focused =
        active instanceof HTMLElement && this.#seatsBody.contains(active)
          ? {
              row: Array.from(this.#seatsBody.children).indexOf(
                active.closest('tr')!
              ),
              control:
                active instanceof HTMLInputElement && active.type === 'radio'
                  ? 'input[type=radio]:checked'
                  : `[name="${active.getAttribute('name')}"]`,
            }
          : null;

    this.#seatsBody.replaceChildren(
      ...setup.seats.map((seat, index) => this.#row(seat, index))
    );

    this.#addSeat.disabled = !setup.canAddSeat();
    this.#seatsNote.textContent = setup.watched() ? t('GameSetup.watched') : '';
    this.#seatsNote.hidden = !setup.watched();

    // The same row, or the last when it was the one removed; failing its control, the first in it that takes the
    //  focus.
    if (focused) {
      const row =
        this.#seatsBody.children[
          Math.min(focused.row, this.#seatsBody.children.length - 1)
        ];

      (
        row?.querySelector<HTMLElement>(`${focused.control}:not(:disabled)`) ??
        row?.querySelector<HTMLElement>(
          'input[type=radio]:checked, select, input:not(:disabled):not([hidden]), button:not(:disabled)'
        ) ??
        this.#addSeat
      ).focus();
    }
  }

  #row(seat: SeatState, index: number): HTMLTableRowElement {
    const setup = this.#setup,
      data = setup.data,
      number = index + 1,
      taken = setup.taken(seat),
      civilization = setup.civilization(seat),
      leaders = civilization?.leaders ?? [],
      // A segmented toggle of radio buttons, named for the row so each row is its own group: the browser's own keys
      //  move between them.
      toggle = s(
        `<div class="ui-segmented" role="radiogroup" aria-label="${t(
          'GameSetup.kind'
        )} ${number}"></div>`,
        ...kinds.map((kind) => {
          const input = s<HTMLInputElement>(
            `<input type="radio" name="kind-${number}" value="${kind}">`
          );

          input.checked = seat.kind === kind;
          input.disabled = kind === 'human' && !setup.canBeHuman(seat);

          h(input, {
            change: () => {
              setup.setKind(seat, kind);

              this.#renderSeats();
            },
          });

          return s(
            '<label class="ui-segment"></label>',
            input,
            s(`<span>${t(`GameSetup.${kind}`)}</span>`)
          );
        })
      ),
      nameInput = s<HTMLInputElement>(
        `<input name="name" type="text" placeholder="${t('GameSetup.name')}"${
          seat.kind === 'human' ? '' : ' hidden'
        }>`
      ),
      civilizationSelect = select('civilization', [
        option(RANDOM, t('GameSetup.random'), {
          selected: seat.civilization === RANDOM,
        }),
        ...data.civilizations.map(({ name }) =>
          option(name, civilizationName(name), {
            selected: seat.civilization === name,
            disabled: taken.has(name),
          })
        ),
      ]),
      // One leader is shown by name; more are offered, with chance among them.
      leader =
        leaders.length === 1
          ? s('<span class="ui-game-setup-leader"></span>')
          : select('leader', [
              option(RANDOM, t('GameSetup.random'), {
                selected: seat.leader === RANDOM,
              }),
              ...leaders.map((name) =>
                option(name, leaderName(name), {
                  selected: seat.leader === name,
                })
              ),
            ]),
      aiSelect = select(
        'ai',
        data.aiClients.map((name) =>
          option(name, name, { selected: seat.ai === name })
        )
      ),
      remove = h(
        button(glyph('close'), {
          variant: 'icon',
          className: 'btn-quiet ui-game-setup-remove',
          title: t('GameSetup.remove-seat'),
          disabled: !setup.canRemoveSeat(),
        }),
        {
          click: () => {
            setup.removeSeat(index);

            this.#renderSeats();
          },
        }
      );

    nameInput.value = seat.name;
    // Named, as the row's other controls are, for the focus to come back to it once the rows are drawn again.
    remove.name = 'remove';

    if (leaders.length === 1) {
      leader.textContent = leaderName(leaders[0]);
    }

    leader.hidden = civilization === null;
    aiSelect.hidden = seat.kind !== 'computer';

    (
      [
        [nameInput, 'GameSetup.name'],
        [civilizationSelect, 'GameSetup.civilization'],
        [leader, 'GameSetup.leader'],
        [aiSelect, 'GameSetup.ai'],
        [remove, 'GameSetup.remove-seat'],
      ] as [HTMLElement, string][]
    ).forEach(([element, key]) =>
      element.setAttribute('aria-label', `${t(key)} ${number}`)
    );

    h(nameInput, { input: () => (seat.name = nameInput.value) });
    h(civilizationSelect, {
      change: () => {
        setup.setCivilization(seat, civilizationSelect.value);

        this.#renderSeats();
      },
    });

    if (leader instanceof HTMLSelectElement) {
      h(leader, { change: () => (seat.leader = leader.value) });
    }

    h(aiSelect, { change: () => (seat.ai = aiSelect.value) });

    const row = document.createElement('tr'),
      heading = document.createElement('th');

    heading.scope = 'row';
    heading.textContent = String(number);
    row.dataset.kind = seat.kind;
    row.append(
      heading,
      cell(toggle),
      cell(nameInput),
      cell(
        s(
          '<div class="ui-game-setup-civilization"></div>',
          civilizationSwatch(civilization?.colours ?? null),
          civilizationSelect
        )
      ),
      cell(leader),
      ...(data.aiClients.length > 1 ? [cell(aiSelect)] : []),
      cell(remove)
    );

    return row;
  }

  async #start(): Promise<void> {
    const problem = this.#setup.problem(
      this.#widthInput.value,
      this.#heightInput.value
    );

    if (problem !== null) {
      const input =
        problem.field === 'width' ? this.#widthInput : this.#heightInput;

      // Shown where it is: the Advanced section opened if it was closed.
      input.closest('details')?.setAttribute('open', '');
      input.setCustomValidity(t(problem.message));
      input.reportValidity();

      return;
    }

    const [landCoverage, landSize, maxIterations] = this.#landInputs.map(
      (input) => input.value
    );

    this.close();

    await this.#setup.start(
      this.#transport,
      { landCoverage, landSize, maxIterations },
      this.#difficultySelect.value,
      this.#onFinished
    );
  }
}

export default GameSetupForm;
