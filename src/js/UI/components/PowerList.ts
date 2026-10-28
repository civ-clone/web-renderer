import { Element, s } from '@dom111/element';
import { TOptions, t } from 'i18next';
import CivilizationPower from '../../Engine/Requests/CivilizationPower';
import { CivilizationPowerRow } from '../../Engine/lib/civilizationPower';
import Transport from '../Transport';
import { toggleEvent } from './SidebarSection';
import { unlessRequestFailed } from '../lib/unlessRequestFailed';

// Every string here is set as text, not markup, so i18next's HTML escaping would show a name with `&` or `'` in it as
//  `&amp;` or `&#39;` (#704).
const text = (key: string, options: TOptions = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

// The rows shown before "Show all", and the most there can be with every row shown anyway: one more than shown isn't
//  worth a link.
export const powerShown = 5;
export const powerShownWhole = 6;

/**
 * The rows to show: all of them in a small game, otherwise five around the player's own, two either side, or the
 *  first or last five when the player is near the top or the foot. Without a row of their own (an observer), the top.
 */
export const powerWindow = (
  rows: CivilizationPowerRow[]
): CivilizationPowerRow[] => {
  if (rows.length <= powerShownWhole) {
    return rows;
  }

  const own = Math.max(
      rows.findIndex((row) => row.own),
      0
    ),
    start = Math.min(
      Math.max(own - Math.floor(powerShown / 2), 0),
      rows.length - powerShown
    );

  return rows.slice(start, start + powerShown);
};

/**
 * Every civilization's power in the sidebar (#701, #708), ranked, with the player's own marked and the unmet unnamed.
 *  The worker ranks them and decides what may be shown; this only draws the rows. Asked for once a turn, and only while
 *  the section is open: opening it asks for the turn's, if it hasn't been.
 */
export class PowerList extends Element {
  // The view and turn last asked about, as `viewer:turn`.
  #asked: string | null = null;
  #rows: CivilizationPowerRow[] = [];
  #showAll = false;
  #transport: Transport;
  #turn: number | null = null;

  constructor(element: HTMLElement, transport: Transport) {
    super(element);

    this.#transport = transport;

    element
      .closest('.sidebar-section')
      ?.addEventListener(toggleEvent, () => this.#refresh());
  }

  #viewer = '';

  /**
   * The turn now and whose view it is, given every render: a new turn asks for the rows again, and so does an
   *  observer switching whom they watch mid-turn (#607), whose rows are someone else's.
   */
  turn(turn: number, viewer: string = ''): void {
    this.#turn = turn;
    this.#viewer = viewer;

    this.#refresh();
  }

  build(rows: CivilizationPowerRow[] = this.#rows): void {
    this.#rows = rows;

    this.empty();

    if (rows.length === 0) {
      const empty = s('<p class="empty"></p>');

      empty.textContent = text('PowerList.empty');

      this.append(empty);

      return;
    }

    const list = s('<ol class="power-list"></ol>');

    list.append(
      ...(this.#showAll ? rows : powerWindow(rows)).map((row) => this.#row(row))
    );

    this.append(list);

    if (rows.length > powerShownWhole) {
      const more = s<HTMLButtonElement>(
        '<button type="button" class="show-all"></button>'
      );

      more.textContent = text(
        this.#showAll ? 'PowerList.show-fewer' : 'PowerList.show-all',
        { count: rows.length }
      );
      more.setAttribute('aria-expanded', this.#showAll ? 'true' : 'false');
      more.addEventListener('click', () => {
        this.#showAll = !this.#showAll;

        this.build();

        // Rebuilt, so the button the keyboard was on is a new one.
        (
          this.element().querySelector('.show-all') as HTMLElement | null
        )?.focus();
      });

      this.append(more);
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
      .request(new CivilizationPower())
      .then((rows: CivilizationPowerRow[]) => {
        // An answer overtaken by a newer question is the old view's or the old turn's.
        if (this.#asked === key) {
          this.build(rows);
        }
      })
      // Not answered: the player has been told (#580), and the last turn's rows are better than none. Asked again
      //  the next time the section is opened.
      .catch((error) => {
        if (this.#asked === key) {
          this.#asked = null;
        }

        return unlessRequestFailed(error);
      });
  }

  #row(row: CivilizationPowerRow): HTMLElement {
    const item = s(
        `<li class="power${row.own ? ' own' : ''}${
          row.civilization === null ? ' unknown' : ''
        }"></li>`
      ),
      content = s('<span class="row"></span>'),
      rank = s('<span class="rank"></span>'),
      swatch = s('<span class="swatch" aria-hidden="true"></span>'),
      name = s('<span class="name"></span>'),
      power = s('<span class="value"></span>');

    rank.textContent = text('PowerList.rank', { rank: row.rank });
    name.textContent =
      row.civilization === null
        ? text('PowerList.unknown')
        : text('Generic.civilization-name.plural', {
            civilization: row.civilization,
            player: { civilization: { _: row.civilization } },
          });
    power.textContent = text('PowerList.power', { power: row.power });

    // The civilization's own colours, as the Top Cities report shows them (#124). None for one not met.
    if (row.colors) {
      const [primary, secondary] = row.colors;

      swatch.style.setProperty('--civilization-primary', primary);
      swatch.style.setProperty('--civilization-secondary', secondary);
    }

    content.append(rank, swatch, name);

    if (row.own) {
      const you = s('<span class="visually-hidden"></span>');

      you.textContent = ` ${text('PowerList.you')}`;
      content.append(you);
      item.setAttribute('aria-current', 'true');
    }

    content.append(power);
    item.append(content);

    return item;
  }
}

export default PowerList;
