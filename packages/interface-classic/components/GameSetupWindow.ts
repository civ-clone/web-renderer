import GameSetup, {
  FinishedHandler,
  GameSetupPreset,
  RANDOM,
  SeatKind,
  SeatState,
  SetupData,
  requestSetupData,
} from '@civ-clone/ui-client/lib/gameSetup';
import { TopologyId } from '@civ-clone/ui-client/lib/topologyFor';
import Transport from '@civ-clone/ui-client/Transport';
import Window from '@civ-clone/ui-component-window/Window';
import {
  difficultyLabels,
  preselectedDifficulty,
} from '@civ-clone/ui-client/lib/difficulty';
import { elementId, h } from '@civ-clone/ui-widgets/lib/html';
import { ruleSetsSection } from '@civ-clone/ui-menus/lib/ruleSetControls';
import {
  cell,
  civilizationName,
  leaderName,
  option,
  select,
} from '@civ-clone/ui-menus/lib/setupControls';
import { s } from '@dom111/element';
import { supportedTopologies } from '@civ-clone/ui-map/lib/supportedTopologies';
import { glyph } from '@civ-clone/ui-platform/lib/glyphs';
import { t } from 'i18next';

export { GameSetupPreset, RANDOM };

/**
 * The shared setup, with the classic window's leader rules: choosing a civilization leaves the leader to chance, even a
 *  lone one, and a leader chosen by hand is sent, even a lone one (#868).
 */
class ClassicGameSetup extends GameSetup {
  override setCivilization(seat: SeatState, civilization: string): void {
    seat.civilization = civilization;
    seat.leader = RANDOM;
  }

  override sendsLeader(seat: SeatState): boolean {
    return seat.civilization !== RANDOM && seat.leader !== RANDOM;
  }
}

const numberInput = (
  name: string,
  value: unknown,
  attributes: string
): HTMLInputElement =>
  s<HTMLInputElement>(
    `<input name="${name}" type="number" value="${value}" ${attributes}>`
  );

/**
 * The game setup (#605): the world at the top, and below it the seats, each a human or a computer player with a
 * civilization and leader chosen or left to chance, and for a computer seat the AI that plays it. It sends the world
 * options and the seat list as one `setOptions`, then `start`, as the New Game questions did between them.
 *
 * Reached from the main menu's Customize button, and from Customize World, which opens it with the Advanced section
 * (the world's exact size and land) open. One human seat for now: hot-seat and network play come with #161.
 */
export class GameSetupWindow extends Window {
  #setup: GameSetup;
  #onFinished?: FinishedHandler;
  #transport: Transport;

  #mapSelect!: HTMLSelectElement;
  #gridSelect!: HTMLSelectElement;
  #widthInput!: HTMLInputElement;
  #heightInput!: HTMLInputElement;
  #landInputs: HTMLInputElement[] = [];
  #seatsBody!: HTMLTableSectionElement;
  #addSeat!: HTMLButtonElement;
  #startButton!: HTMLButtonElement;

  constructor(
    transport: Transport,
    data: SetupData,
    onFinished?: FinishedHandler,
    preset: GameSetupPreset = {}
  ) {
    super(t('GameSetup.title'), s('<div class="game-setup"></div>'), {
      classes: 'game-setup-window',
      modal: true,
    });

    this.#setup = new ClassicGameSetup(data, preset);
    this.#onFinished = onFinished;
    this.#transport = transport;

    this.#build(preset);
  }

  /** Asks the worker what there is to choose from, then shows the window. */
  static async ask(
    transport: Transport,
    onFinished?: FinishedHandler,
    preset: GameSetupPreset = {}
  ): Promise<GameSetupWindow> {
    return new GameSetupWindow(
      transport,
      await requestSetupData(transport),
      onFinished,
      preset
    );
  }

  /** The seats a game has, as the window holds them. */
  seats(): SeatState[] {
    return this.#setup.seats.map((seat) => ({ ...seat }));
  }

  #build(preset: GameSetupPreset): void {
    // Made first, for the Rules section to hold while the rule sets have a problem that blocks (#954).
    this.#startButton = h(
      s<HTMLButtonElement>(
        `<button class="btn-primary start">${t('GameSetup.start')}</button>`
      ),
      {
        click: () => this.#start(difficultySelect.value),
      }
    );

    const setup = this.#setup,
      data = setup.data,
      grids = supportedTopologies(),
      difficultySelect = select(
        'difficulty',
        difficultyLabels(data.difficulties).map(({ label, value }) =>
          option(value, label, {
            selected: value === preselectedDifficulty(data.difficulties),
          })
        )
      ),
      advanced = s<HTMLDetailsElement>(
        `<details class="advanced"${preset.advanced ? ' open' : ''}></details>`,
        s(`<summary>${t('GameSetup.advanced')}</summary>`)
      ),
      // The rule sets the game can be started with or without (#158), when the rules offer any.
      rules = ruleSetsSection(
        setup,
        this.#transport,
        'rules rule-sets-section',
        this.#startButton
      ),
      // The table parts are made, not parsed: `s()` parses inside a `<div>`, where a browser drops a bare `<thead>` or
      //  `<tr>` (the test DOM doesn't, so a test would not have said).
      table = document.createElement('table'),
      head = document.createElement('thead'),
      headRow = document.createElement('tr');

    table.className = 'seats';
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
        const cell = document.createElement('th');

        cell.scope = 'col';
        cell.textContent = key ? t(key) : '';

        return cell;
      })
    );
    head.append(headRow);
    table.append(head);

    this.#gridSelect = select(
      'topologyId',
      grids.map((grid) =>
        option(grid, t(`Grid.${grid}`), {
          selected: grid === setup.topologyId,
        })
      )
    );
    this.#mapSelect = select('map', []);
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
    this.#seatsBody = document.createElement('tbody');
    this.#addSeat = h(
      s<HTMLButtonElement>(
        `<button class="btn-secondary">${t('GameSetup.add-seat')}</button>`
      ),
      {
        click: () => {
          setup.addSeat();

          this.#renderSeats();
        },
      }
    );

    table.append(this.#seatsBody);

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
      ...(
        [
          [this.#widthInput, 'CustomizeWorld.width'],
          [this.#heightInput, 'CustomizeWorld.height'],
          [this.#landInputs[0], 'CustomizeWorld.land-coverage'],
          [this.#landInputs[1], 'CustomizeWorld.land-size'],
          [this.#landInputs[2], 'CustomizeWorld.max-iterations'],
        ] as [HTMLInputElement, string][]
      ).map(([input, label]) =>
        s(
          `<div class="option"><label for="${elementId(input)}">${t(
            label
          )}</label></div>`,
          input
        )
      )
    );

    this.update(
      s(
        '<div class="game-setup"></div>',
        s(
          '<div class="world"></div>',
          ...(grids.length > 1
            ? [
                s(
                  `<div class="option"><label for="${elementId(
                    this.#gridSelect
                  )}">${t('GameSetup.grid')}</label></div>`,
                  this.#gridSelect
                ),
              ]
            : []),
          s(
            `<div class="option"><label for="${elementId(this.#mapSelect)}">${t(
              'GameSetup.map'
            )}</label></div>`,
            this.#mapSelect
          ),
          s(
            `<div class="option"><label for="${elementId(
              difficultySelect
            )}">${t('GameSetup.difficulty')}</label></div>`,
            difficultySelect
          ),
          ...(rules === null ? [] : [rules]),
          advanced
        ),
        s(`<h4>${t('GameSetup.seats')}</h4>`),
        table,
        s('<div class="actions"></div>', this.#addSeat),
        this.#startButton
      )
    );

    this.#renderMap();

    this.on('keydown', (event) => {
      // Not from a select, a button, a rule set's checkbox or the Advanced summary, which Enter works or which it
      //  would be a surprise to start a game from, nor mid-composition in the name.
      if (
        event.key === 'Enter' &&
        !event.isComposing &&
        !(event.target instanceof HTMLSelectElement) &&
        !(event.target instanceof HTMLButtonElement) &&
        !(
          event.target instanceof HTMLInputElement &&
          ['checkbox', 'radio'].includes(event.target.type)
        ) &&
        !(
          event.target instanceof HTMLElement && event.target.closest('summary')
        )
      ) {
        this.#start(difficultySelect.value);

        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  // The map list, as the setup has it. Earth is square only, and its land is the map's, so those controls are held
  //  while it's chosen.
  #renderMap(): void {
    const setup = this.#setup,
      current = setup.map();

    this.#mapSelect.replaceChildren(
      ...setup
        .maps()
        .map(({ value, label }) =>
          option(value, label, { selected: value === current })
        )
    );

    if (setup.earth) {
      this.#gridSelect.value = 'square';
    }

    this.#gridSelect.disabled = setup.earth;
    this.#widthInput.disabled = setup.earth;
    this.#heightInput.disabled = setup.earth;
    this.#landInputs.forEach((input) => (input.disabled = setup.earth));

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
      data = setup.data;

    // The rows are rebuilt, so whatever had the focus is put back by its row and control.
    const active = document.activeElement,
      focused =
        active instanceof HTMLElement && this.#seatsBody.contains(active)
          ? {
              row: Array.from(this.#seatsBody.children).indexOf(
                active.closest('tr')!
              ),
              name: active.getAttribute('name'),
            }
          : null;

    this.#seatsBody.replaceChildren(
      ...setup.seats.map((seat, index) => {
        const taken = setup.taken(seat),
          civilization = setup.civilization(seat),
          kindSelect = select('kind', [
            option('human', t('GameSetup.human'), {
              selected: seat.kind === 'human',
              // One human player for now (#161).
              disabled: !setup.canBeHuman(seat),
            }),
            option('computer', t('GameSetup.computer'), {
              selected: seat.kind === 'computer',
            }),
          ]),
          nameInput = s<HTMLInputElement>(
            `<input name="name" type="text" placeholder="${t(
              'GameSetup.name'
            )}"${seat.kind === 'human' ? '' : ' hidden'}>`
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
          leaderSelect = select('leader', [
            option(RANDOM, t('GameSetup.random'), {
              selected: seat.leader === RANDOM,
            }),
            ...(civilization?.leaders ?? []).map((name) =>
              option(name, leaderName(name), { selected: seat.leader === name })
            ),
          ]),
          aiSelect = select(
            'ai',
            data.aiClients.map((name) =>
              option(name, name, { selected: seat.ai === name })
            )
          ),
          remove = h(
            s<HTMLButtonElement>(
              `<button class="btn-icon remove" title="${t(
                'GameSetup.remove-seat'
              )}">${glyph('close')}</button>`
            ),
            {
              click: () => {
                setup.removeSeat(index);

                this.#renderSeats();
              },
            }
          );

        nameInput.value = seat.name;
        leaderSelect.hidden = !civilization;
        aiSelect.hidden = seat.kind !== 'computer';
        (
          [
            [kindSelect, 'GameSetup.kind'],
            [nameInput, 'GameSetup.name'],
            [civilizationSelect, 'GameSetup.civilization'],
            [leaderSelect, 'GameSetup.leader'],
            [aiSelect, 'GameSetup.ai'],
            [remove, 'GameSetup.remove-seat'],
          ] as [HTMLElement, string][]
        ).forEach(([element, key]) =>
          element.setAttribute('aria-label', `${t(key)} ${index + 1}`)
        );
        remove.disabled = !setup.canRemoveSeat();

        h(kindSelect, {
          change: () => {
            setup.setKind(seat, kindSelect.value as SeatKind);

            this.#renderSeats();
          },
        });
        h(nameInput, { input: () => (seat.name = nameInput.value) });
        h(civilizationSelect, {
          change: () => {
            setup.setCivilization(seat, civilizationSelect.value);

            this.#renderSeats();
          },
        });
        h(leaderSelect, { change: () => (seat.leader = leaderSelect.value) });
        h(aiSelect, { change: () => (seat.ai = aiSelect.value) });

        const row = document.createElement('tr'),
          number = cell();

        number.textContent = String(index + 1);

        row.append(
          number,
          cell(kindSelect),
          cell(nameInput),
          cell(civilizationSelect),
          cell(leaderSelect),
          ...(data.aiClients.length > 1 ? [cell(aiSelect)] : []),
          cell(remove)
        );

        return row;
      })
    );

    this.#addSeat.disabled = !setup.canAddSeat();

    if (focused) {
      const row = this.#seatsBody.children[focused.row];

      (
        row?.querySelector<HTMLElement>(`[name="${focused.name}"]`) ??
        row?.querySelector<HTMLElement>('select, input, button') ??
        this.#addSeat
      ).focus();
    }
  }

  async #start(difficulty: string): Promise<void> {
    // Held, and said why, in the Rules section (#954): Enter is held too.
    if (this.#setup.ruleSetsBlockStart()) {
      return;
    }

    const problem = this.#setup.problem(
      this.#widthInput.value,
      this.#heightInput.value
    );

    if (problem !== null) {
      const input =
        problem.field === 'width' ? this.#widthInput : this.#heightInput;

      input.setCustomValidity(t(problem.message));
      input.reportValidity();

      return;
    }

    // The three land inputs, in order.
    const [landCoverage, landSize, maxIterations] = this.#landInputs.map(
      (input) => input.value
    ) as [string, string, string];

    this.close();

    await this.#setup.start(
      this.#transport,
      { landCoverage, landSize, maxIterations },
      difficulty,
      this.#onFinished
    );
  }
}

export default GameSetupWindow;
