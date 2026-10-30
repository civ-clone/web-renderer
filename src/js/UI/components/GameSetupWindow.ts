import AIClients from '../../Engine/Requests/AIClients';
import Civilizations, {
  CivilizationOption,
} from '../../Engine/Requests/Civilizations';
import Difficulties, {
  DifficultyOption,
} from '../../Engine/Requests/Difficulties';
import Options from '../../Engine/Requests/Options';
import Request from '../../Engine/Request';
import { TopologyId } from '../lib/topologyFor';
import Transport from '../Transport';
import Window from './Window';
import {
  WorldSize,
  customSizeProblem,
  defaultWorldSize,
  earthWorldSizes,
  worldSizesFor,
} from '../lib/worldSizes';
import {
  difficultyLabels,
  preselectedDifficulty,
  rememberDifficulty,
} from '../lib/difficulty';
import { elementId, h } from '../lib/html';
import {
  cell,
  civilizationName,
  leaderName,
  option,
  select,
} from '../lib/setupControls';
import { s } from '@dom111/element';
import { supportedTopologies } from '../lib/supportedTopologies';
import { t } from 'i18next';
import { unlessRequestFailed } from '../lib/unlessRequestFailed';

type FinishedHandler = () => void | Promise<void>;

/** What the window opens with: Earth selected, or the Advanced section open, as Customize World. */
export type GameSetupPreset = {
  advanced?: boolean;
  earth?: boolean;
};

/** A seat as the table holds it; `random` and the default AI are sent as nothing (#604). */
type SeatState = {
  kind: 'human' | 'computer';
  name: string;
  civilization: string;
  leader: string;
  ai: string;
};

/** What the worker answers before the window is built. */
type SetupData = {
  aiClients: string[];
  civilizations: CivilizationOption[];
  difficulties: DifficultyOption[];
  existing: { [key: string]: any };
};

export const RANDOM = 'random';

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
  #data: SetupData;
  #onFinished?: FinishedHandler;
  #transport: Transport;

  // The world.
  #topologyId: TopologyId = 'square';
  #earth: boolean = false;
  #size: WorldSize | null = defaultWorldSize;
  #width: number = defaultWorldSize.width;
  #height: number = defaultWorldSize.height;

  // The seats, in player order.
  #seats: SeatState[] = [];

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

    this.#data = data;
    this.#onFinished = onFinished;
    this.#transport = transport;

    if (preset.earth) {
      this.#earth = true;
    }

    // Customize World opens on the world last set, as its own window did: one of the sizes, or a custom one.
    const width = Number(data.existing.width),
      height = Number(data.existing.height);

    if (preset.advanced && width > 0 && height > 0) {
      this.#size =
        worldSizesFor(this.#topologyId).find(
          (size) => size.width === width && size.height === height
        ) ?? null;
      this.#width = width;
      this.#height = height;
    }

    this.#seats = new Array(this.#defaultSeatCount()).fill(0).map(
      (value: 0, index: number): SeatState => ({
        kind: index === 0 ? 'human' : 'computer',
        name: '',
        civilization: RANDOM,
        leader: RANDOM,
        ai: data.aiClients[0] ?? '',
      })
    );

    this.#build(preset);
  }

  /** Asks the worker what there is to choose from, then shows the window. */
  static async ask(
    transport: Transport,
    onFinished?: FinishedHandler,
    preset: GameSetupPreset = {}
  ): Promise<GameSetupWindow> {
    const [civilizations, aiClients, difficulties, existing] =
      await Promise.all([
        transport.request(new Civilizations()),
        transport.request(new AIClients()),
        transport.request(new Difficulties()),
        transport.request(
          new Options([
            'width',
            'height',
            'landCoverage',
            'landSize',
            'maxIterations',
          ])
        ),
      ]);

    return new GameSetupWindow(
      transport,
      { aiClients, civilizations, difficulties, existing },
      onFinished,
      preset
    );
  }

  /** The seats a game has, as the window holds them. */
  seats(): SeatState[] {
    return this.#seats.map((seat) => ({ ...seat }));
  }

  #defaultSeatCount(): number {
    return Math.min(
      this.#size?.players ?? defaultWorldSize.players,
      this.#maxSeats()
    );
  }

  // As many seats as the map has room for, or as there are civilizations to play.
  #maxSeats(): number {
    return Math.min(
      this.#size?.maxPlayers ?? this.#data.civilizations.length,
      this.#data.civilizations.length
    );
  }

  #sizes(): WorldSize[] {
    return this.#earth ? earthWorldSizes : worldSizesFor(this.#topologyId);
  }

  #build(preset: GameSetupPreset): void {
    const data = this.#data,
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
        option(grid, t(`Grid.${grid}`), { selected: grid === this.#topologyId })
      )
    );
    this.#mapSelect = select('map', []);
    this.#widthInput = numberInput('width', this.#width, 'step="1" min="1"');
    this.#heightInput = numberInput('height', this.#height, 'step="1" min="1"');
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
          this.#seats.push({
            kind: 'computer',
            name: '',
            civilization: RANDOM,
            leader: RANDOM,
            ai: data.aiClients[0] ?? '',
          });

          this.#renderSeats();
        },
      }
    );

    table.append(this.#seatsBody);

    h(this.#gridSelect, {
      change: () => {
        this.#topologyId = this.#gridSelect.value as TopologyId;

        // The same size on the new grid has its own width and height.
        if (this.#size) {
          this.#size =
            worldSizesFor(this.#topologyId).find(
              (size) => size.key === this.#size!.key
            ) ?? null;
          this.#width = this.#size?.width ?? this.#width;
          this.#height = this.#size?.height ?? this.#height;
        }

        this.#renderMap();
      },
    });

    h(this.#mapSelect, {
      change: () => {
        const [kind, key] = this.#mapSelect.value.split(':');

        this.#earth = kind === 'earth';
        this.#size = this.#sizes().find((size) => size.key === key) ?? null;

        if (this.#size) {
          this.#width = this.#size.width;
          this.#height = this.#size.height;
        }

        this.#renderMap();
      },
    });

    // A size typed in is a custom world: the map says so, and the seats keep whatever room there is.
    [this.#widthInput, this.#heightInput].forEach((input) =>
      h(input, {
        input: () => {
          input.setCustomValidity('');

          this.#width = Number(this.#widthInput.value);
          this.#height = Number(this.#heightInput.value);
          this.#size = null;
          this.#earth = false;

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
          advanced
        ),
        s(`<h4>${t('GameSetup.seats')}</h4>`),
        table,
        s('<div class="actions"></div>', this.#addSeat),
        (this.#startButton = h(
          s<HTMLButtonElement>(
            `<button class="btn-primary start">${t('GameSetup.start')}</button>`
          ),
          {
            click: () => this.#start(difficultySelect.value),
          }
        ))
      )
    );

    this.#renderMap();

    this.on('keydown', (event) => {
      // Not from a select, a button or the Advanced summary, which Enter works, nor mid-composition in the name.
      if (
        event.key === 'Enter' &&
        !event.isComposing &&
        !(event.target instanceof HTMLSelectElement) &&
        !(event.target instanceof HTMLButtonElement) &&
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

  // The map list: this grid's sizes, Earth's sizes, and the custom size when one is typed. Earth is square only, and
  //  its land is the map's, so those controls are held while it's chosen.
  #renderMap(): void {
    const sizes = worldSizesFor(this.#topologyId),
      current = this.#size
        ? `${this.#earth ? 'earth' : 'size'}:${this.#size.key}`
        : 'custom',
      options = [
        ...sizes.map((size) =>
          option(
            `size:${size.key}`,
            t(`NewGameWindow.WorldSize.${size.key}`, {
              width: size.width,
              height: size.height,
            }),
            { selected: current === `size:${size.key}` }
          )
        ),
        ...earthWorldSizes.map((size) =>
          option(
            `earth:${size.key}`,
            t('GameSetup.earth', {
              size: t(`NewGameWindow.WorldSize.${size.key}`, {
                width: size.width,
                height: size.height,
              }),
            }),
            { selected: current === `earth:${size.key}` }
          )
        ),
        ...(this.#size
          ? []
          : [
              option(
                'custom',
                t('GameSetup.custom', {
                  width: this.#width,
                  height: this.#height,
                }),
                { selected: true }
              ),
            ]),
      ];

    this.#mapSelect.replaceChildren(...options);

    if (this.#earth) {
      this.#topologyId = 'square';
      this.#gridSelect.value = 'square';
    }

    this.#gridSelect.disabled = this.#earth;
    this.#widthInput.disabled = this.#earth;
    this.#heightInput.disabled = this.#earth;
    this.#landInputs.forEach((input) => (input.disabled = this.#earth));

    if (document.activeElement !== this.#widthInput) {
      this.#widthInput.value = String(this.#width);
    }

    if (document.activeElement !== this.#heightInput) {
      this.#heightInput.value = String(this.#height);
    }

    // A smaller map has room for fewer: computer seats go first, from the end, so the human's stays.
    while (this.#seats.length > this.#maxSeats()) {
      const last = [...this.#seats]
        .reverse()
        .find((seat) => seat.kind === 'computer');

      this.#seats.splice(this.#seats.indexOf(last ?? this.#seats[0]), 1);
    }

    this.#renderSeats();
  }

  #renderSeats(): void {
    const data = this.#data,
      humanSeated = this.#seats.some((seat) => seat.kind === 'human'),
      chosen = (except: SeatState): Set<string> =>
        new Set(
          this.#seats
            .filter((seat) => seat !== except && seat.civilization !== RANDOM)
            .map((seat) => seat.civilization)
        );

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
      ...this.#seats.map((seat, index) => {
        const taken = chosen(seat),
          civilization = data.civilizations.find(
            ({ name }) => name === seat.civilization
          ),
          kindSelect = select('kind', [
            option('human', t('GameSetup.human'), {
              selected: seat.kind === 'human',
              // One human player for now (#161).
              disabled: humanSeated && seat.kind !== 'human',
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
              )}">×</button>`
            ),
            {
              click: () => {
                this.#seats.splice(index, 1);

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
        // The last seat stays: a game needs one.
        remove.disabled = this.#seats.length <= 1;

        h(kindSelect, {
          change: () => {
            seat.kind = kindSelect.value as SeatState['kind'];

            this.#renderSeats();
          },
        });
        h(nameInput, { input: () => (seat.name = nameInput.value) });
        h(civilizationSelect, {
          change: () => {
            seat.civilization = civilizationSelect.value;
            seat.leader = RANDOM;

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

    this.#addSeat.disabled = this.#seats.length >= this.#maxSeats();

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
    if (!this.#earth) {
      const problem = customSizeProblem(
        this.#topologyId,
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
    }

    const [landCoverage, landSize, maxIterations] = this.#landInputs.map(
        (input) => input.value
      ),
      seats = this.#seats.map((seat) => ({
        kind: seat.kind,
        ...(seat.kind === 'human' && seat.name.trim() !== ''
          ? { name: seat.name.trim() }
          : {}),
        ...(seat.civilization !== RANDOM
          ? { civilization: seat.civilization }
          : {}),
        ...(seat.civilization !== RANDOM && seat.leader !== RANDOM
          ? { leader: seat.leader }
          : {}),
        ...(seat.kind === 'computer' &&
        seat.ai !== '' &&
        seat.ai !== this.#data.aiClients[0]
          ? { ai: seat.ai }
          : {}),
      }));

    if (difficulty !== '') {
      rememberDifficulty(difficulty);
    }

    this.close();

    try {
      await this.#transport.request(
        new Request('setOptions', {
          topologyId: this.#topologyId,
          earth: this.#earth,
          width: this.#width,
          height: this.#height,
          landCoverage,
          landSize,
          maxIterations,
          difficulty,
          seats,
        })
      );
    } catch (error) {
      // Not answered: the player has been told, and the main menu is still there, with no game started (#580).
      unlessRequestFailed(error);

      return;
    }

    if (this.#onFinished) {
      await this.#onFinished();
    }

    this.#transport.send('start', null);
  }
}

export default GameSetupWindow;
