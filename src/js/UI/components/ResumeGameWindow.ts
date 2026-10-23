import AIClients from '../../Engine/Requests/AIClients';
import {
  SavedSeat,
  SeatChanges,
  savedSeats,
} from '../../Engine/lib/savedSeats';
import { Seat } from '../../Engine/lib/seats';
import Transport from '../Transport';
import Window from './Window';
import {
  cell,
  civilizationName,
  leaderName,
  option,
  select,
} from '../lib/setupControls';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

/** A seat as the window holds it: the file's, and who plays it now. */
type SeatState = {
  saved: SavedSeat;
  kind: Seat['kind'];
  name: string;
  ai: string;
};

/** What the window gives back: the seats changed, by player id, or `null` when the window was closed instead. */
export type ResumeHandler = (changes: SeatChanges | null) => void;

/**
 * Loading a save shows its seats first (#608): each civilization in the game and who plays it, for a person to take
 * over a computer seat or hand theirs to the computer before the game goes on. The world is as it was saved, so
 * nothing of it is offered; one human seat for now (#161). Resume hands back only the seats that changed; closing the
 * window hands back nothing, and no game loads.
 */
export class ResumeGameWindow extends Window {
  #aiClients: string[];
  #done = false;
  #onDone: ResumeHandler;
  #seats: SeatState[];
  #seatsBody!: HTMLTableSectionElement;

  constructor(seats: SavedSeat[], aiClients: string[], onDone: ResumeHandler) {
    super(
      t('ResumeGame.title'),
      s('<div class="game-setup resume-game"></div>'),
      {
        classes: 'resume-game-window',
        modal: true,
      }
    );

    this.#aiClients = aiClients;
    this.#onDone = onDone;
    this.#seats = seats.map(
      (saved): SeatState => ({
        saved,
        kind: saved.seat.kind,
        name: saved.seat.name ?? '',
        ai: saved.seat.ai ?? aiClients[0] ?? '',
      })
    );

    this.#build();
  }

  /** Asks the worker which AI clients there are, shows the file's seats, and settles with what Resume or Close said. */
  static async ask(
    transport: Transport,
    file: Parameters<typeof savedSeats>[0]
  ): Promise<SeatChanges | null> {
    const aiClients = await transport.request(new AIClients());

    return new Promise((resolve) => {
      new ResumeGameWindow(savedSeats(file), aiClients, resolve);
    });
  }

  close(): void {
    super.close();

    if (!this.#done) {
      this.#done = true;

      this.#onDone(null);
    }
  }

  // The AI clients to choose from: this build's, and the one the file names when this build lacks it, so a seat isn't
  //  changed by being shown.
  #aiOptions(seat: SeatState): string[] {
    return this.#aiClients.includes(seat.ai) || seat.ai === ''
      ? this.#aiClients
      : [...this.#aiClients, seat.ai];
  }

  #build(): void {
    const table = document.createElement('table'),
      head = document.createElement('thead'),
      headRow = document.createElement('tr'),
      showAI =
        this.#aiClients.length > 1 ||
        this.#seats.some((seat) => !this.#aiClients.includes(seat.ai));

    table.className = 'seats';
    headRow.append(
      ...[
        'GameSetup.seat',
        'GameSetup.civilization',
        'GameSetup.leader',
        'GameSetup.kind',
        'GameSetup.name',
        ...(showAI ? ['GameSetup.ai'] : []),
      ].map((key) => {
        const column = document.createElement('th');

        column.scope = 'col';
        column.textContent = t(key);

        return column;
      })
    );
    head.append(headRow);
    this.#seatsBody = document.createElement('tbody');
    table.append(head, this.#seatsBody);

    this.update(
      s(
        '<div class="game-setup resume-game"></div>',
        s(`<p>${t('ResumeGame.intro')}</p>`),
        table,
        h(
          s<HTMLButtonElement>(
            `<button class="resume">${t('ResumeGame.resume')}</button>`
          ),
          { click: () => this.#resume() }
        )
      )
    );

    this.#renderSeats(showAI);

    this.on('keydown', (event) => {
      if (
        event.key === 'Enter' &&
        !event.isComposing &&
        !(event.target instanceof HTMLSelectElement) &&
        !(event.target instanceof HTMLButtonElement)
      ) {
        this.#resume();

        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  #renderSeats(showAI: boolean): void {
    const humanSeated = this.#seats.some((seat) => seat.kind === 'human');

    this.#seatsBody.replaceChildren(
      ...this.#seats.map((seat, index) => {
        const kindSelect = select('kind', [
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
          aiSelect = select(
            'ai',
            this.#aiOptions(seat).map((name) =>
              option(name, name, { selected: seat.ai === name })
            )
          ),
          row = document.createElement('tr'),
          number = cell(),
          civilization = cell(),
          leader = cell();

        nameInput.value = seat.name;
        aiSelect.hidden = seat.kind !== 'computer';
        number.textContent = String(index + 1);
        civilization.textContent =
          seat.saved.civilization === null
            ? ''
            : civilizationName(seat.saved.civilization);
        leader.textContent =
          seat.saved.leader === null ? '' : leaderName(seat.saved.leader);

        (
          [
            [kindSelect, 'GameSetup.kind'],
            [nameInput, 'GameSetup.name'],
            [aiSelect, 'GameSetup.ai'],
          ] as [HTMLElement, string][]
        ).forEach(([element, key]) =>
          element.setAttribute('aria-label', `${t(key)} ${index + 1}`)
        );

        h(kindSelect, {
          change: () => {
            seat.kind = kindSelect.value as Seat['kind'];

            this.#renderSeats(showAI);
          },
        });
        h(nameInput, { input: () => (seat.name = nameInput.value) });
        h(aiSelect, { change: () => (seat.ai = aiSelect.value) });

        row.append(
          number,
          civilization,
          leader,
          cell(kindSelect),
          cell(nameInput),
          ...(showAI ? [cell(aiSelect)] : [])
        );

        return row;
      })
    );
  }

  // The seats that differ from the file's: a person's, with their name, or a computer's with its AI (the default
  //  sent as nothing, as the setup sends it). Keyed by the file's player ids as own properties only, whatever they
  //  are called.
  #changes(): SeatChanges {
    const defaultAI = this.#aiClients[0],
      changed = new Map<string, Seat>();

    this.#seats.forEach(({ saved, kind, name, ai }) => {
      const trimmed = name.trim(),
        seat: Seat =
          kind === 'human'
            ? { kind, ...(trimmed === '' ? {} : { name: trimmed }) }
            : { kind, ...(ai === '' || ai === defaultAI ? {} : { ai }) };

      if (
        seat.kind !== saved.seat.kind ||
        (seat.name ?? '') !== (saved.seat.name ?? '').trim() ||
        (seat.ai ?? defaultAI) !== (saved.seat.ai ?? defaultAI)
      ) {
        changed.set(saved.playerId, seat);
      }
    });

    return Object.fromEntries(changed);
  }

  #resume(): void {
    const changes = this.#changes();

    this.#done = true;

    this.close();
    this.#onDone(changes);
  }
}

export default ResumeGameWindow;
