import { Element, s } from '@dom111/element';
import { TOptions, t } from 'i18next';
import CivilizationScores from '../../Engine/Requests/CivilizationScores';
import { CivilizationScoresRow } from '../../Engine/lib/civilizationScores';
import Transport from '../Transport';
import { toggleEvent } from './SidebarSection';
import { unlessRequestFailed } from '../lib/unlessRequestFailed';

// Every string here is set as text, not markup, so i18next's HTML escaping would show a name with `&` or `'` in it as
//  `&amp;` or `&#39;` (#704).
const text = (key: string, options: TOptions = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

// What opens the Civilization Score report, as F9 does: the player's own row opens it.
export type ScoresReport = {
  key: string;
  open: () => void;
};

/**
 * Every civilization's score in the sidebar (#701), ranked, with the player's own marked and the unmet unnamed. The
 *  worker ranks them and decides what may be shown; this only draws the rows. Asked for once a turn, and only while
 *  the section is open: opening it asks for the turn's, if it hasn't been.
 */
export class ScoresList extends Element {
  // The view and turn last asked about, as `viewer:turn`.
  #asked: string | null = null;
  #report: ScoresReport;
  #transport: Transport;
  #turn: number | null = null;

  constructor(
    element: HTMLElement,
    transport: Transport,
    report: ScoresReport
  ) {
    super(element);

    this.#report = report;
    this.#transport = transport;

    element
      .closest('.sidebar-section')
      ?.addEventListener(toggleEvent, () => this.#refresh());
  }

  #viewer = '';

  /**
   * The turn now and whose view it is, given every render: a new turn asks for the scores again, and so does an
   *  observer switching whom they watch mid-turn (#607), whose rows are someone else's.
   */
  turn(turn: number, viewer: string = ''): void {
    this.#turn = turn;
    this.#viewer = viewer;

    this.#refresh();
  }

  build(rows: CivilizationScoresRow[]): void {
    // The keyboard on the player's own row, to put it back there once the list is rebuilt.
    const ownFocused =
      (document.activeElement as HTMLElement | null)?.closest('.own') !==
        null && this.element().contains(document.activeElement);

    this.empty();

    if (rows.length === 0) {
      const empty = s('<p class="empty"></p>');

      empty.textContent = text('ScoresList.empty');

      this.append(empty);

      return;
    }

    const list = s('<ol class="scores-list"></ol>');

    list.append(...rows.map((row) => this.#row(row)));

    this.append(list);

    if (ownFocused) {
      (list.querySelector('.own button') as HTMLElement | null)?.focus();
    }
  }

  // Not while the section is collapsed: nobody would see them.
  #refresh(): void {
    const key = `${this.#viewer}:${this.#turn}`;

    if (
      this.#turn === null ||
      key === this.#asked ||
      this.element().closest<HTMLElement>('.body')?.hidden
    ) {
      return;
    }

    this.#asked = key;

    this.#transport
      .request(new CivilizationScores())
      .then((rows: CivilizationScoresRow[]) => {
        // An answer overtaken by a newer question is the old view's or the old turn's.
        if (this.#asked === key) {
          this.build(rows);
        }
      })
      // Not answered: the player has been told (#580), and the last turn's scores are better than none. Asked again
      //  the next time the section is opened.
      .catch((error) => {
        if (this.#asked === key) {
          this.#asked = null;
        }

        return unlessRequestFailed(error);
      });
  }

  #row(row: CivilizationScoresRow): HTMLElement {
    const item = s(
        `<li class="score${row.own ? ' own' : ''}${
          row.civilization === null ? ' unknown' : ''
        }"></li>`
      ),
      content = s(
        row.own
          ? '<button type="button" class="row"></button>'
          : '<span class="row"></span>'
      ),
      rank = s('<span class="rank"></span>'),
      swatch = s('<span class="swatch" aria-hidden="true"></span>'),
      name = s('<span class="name"></span>'),
      score = s('<span class="value"></span>');

    rank.textContent = text('ScoresList.rank', { rank: row.rank });
    name.textContent =
      row.civilization === null
        ? text('ScoresList.unknown')
        : text('Generic.civilization-name.plural', {
            civilization: row.civilization,
            player: { civilization: { _: row.civilization } },
          });
    score.textContent = text('ScoresList.score', { score: row.score });

    // The civilization's own colours, as the Top Cities report shows them (#124). None for one not met.
    if (row.colors) {
      const [primary, secondary] = row.colors;

      swatch.style.setProperty('--civilization-primary', primary);
      swatch.style.setProperty('--civilization-secondary', secondary);
    }

    content.append(rank, swatch, name);

    if (row.own) {
      const you = s('<span class="visually-hidden"></span>');

      you.textContent = ` ${text('ScoresList.you')}`;
      content.append(you);

      content.setAttribute(
        'title',
        text('ScoresList.open', {
          key: this.#report.key,
        })
      );
      content.addEventListener('click', () => this.#report.open());
      item.setAttribute('aria-current', 'true');
    }

    content.append(score);
    item.append(content);

    return item;
  }
}

export default ScoresList;
