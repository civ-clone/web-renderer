import { h } from '../../lib/html';
import { instance as localeProvider } from '../../LocaleProvider';
import { s } from '@dom111/element';
import { t } from 'i18next';

/** A warning on a cell, as a colour rather than a word (#744): `negative` for a loss, `warn` for a risk. */
export type ReportTone = 'negative' | 'warn' | null;

export type ReportCell = string | number | Node | null;

export interface ReportColumn<Row> {
  // Names the column, so its sort is kept across redraws.
  key: string;
  // The heading, in words. With an `icon`, the words are for a screen reader and the tooltip.
  heading: string;
  icon?: () => Node;
  // A number is right-aligned in tabular figures, and drawn in the locale's format. A meter is a figure with a bar.
  kind?: 'text' | 'number' | 'meter';
  // The row's header cell: what a screen reader names the row by.
  header?: boolean;
  cell: (row: Row) => ReportCell;
  // What the column sorts by. Without one, the column can't be sorted.
  sortValue?: (row: Row) => number | string;
  // Which way the first click sorts: most first for a number or a meter, A to Z for words, unless it says.
  sortFirst?: ReportSort['direction'];
  tone?: (row: Row) => ReportTone;
}

export interface ReportSort {
  key: string;
  direction: 'ascending' | 'descending';
}

export interface ReportTableOptions<Row> {
  columns: ReportColumn<Row>[];
  // Names a row, so it keeps the focus when the table is redrawn.
  rowKey: (row: Row) => string;
  // What clicking a row, or Enter on it, opens: the city, or the unit's Civilopedia entry. Without it, rows are text.
  open?: (row: Row) => void;
  // The footer, by column key; the first column says what it is unless it's given.
  totals?: (rows: Row[]) => { [key: string]: ReportCell };
  caption?: string;
  sort?: ReportSort | null;
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

const compare = (a: number | string, b: number | string): number =>
  typeof a === 'number' && typeof b === 'number'
    ? a - b
    : collator.compare(String(a), String(b));

const fill = (cell: HTMLElement, content: ReportCell, kind?: string): void => {
  if (content === null) {
    return;
  }

  if (content instanceof Node) {
    cell.append(content);

    return;
  }

  cell.textContent =
    kind === 'number' && typeof content === 'number'
      ? localeProvider.number(content)
      : String(content);
};

/**
 * The one table every report is drawn with under the new interface (#744): headers that sort when clicked, with the
 *  sorted one marked, numbers right-aligned in tabular figures, warnings as a colour on the cell, rows that open their
 *  item, and a totals row. The sort is kept across `update()`, so a report that follows the game stays in the order the
 *  player chose. Drawn by `_report-table.scss` from the theme's tokens.
 */
export class ReportTable<Row> {
  #body: HTMLTableSectionElement = document.createElement('tbody');
  #columns: ReportColumn<Row>[];
  #foot: HTMLTableSectionElement = document.createElement('tfoot');
  #headings: Map<string, HTMLTableCellElement> = new Map();
  #open: ((row: Row) => void) | null;
  #rowKey: (row: Row) => string;
  #rows: { element: HTMLTableRowElement; row: Row; index: number }[] = [];
  #sort: ReportSort | null;
  #table: HTMLTableElement = document.createElement('table');
  #totals: ReportTableOptions<Row>['totals'] | null;

  constructor({
    columns,
    rowKey,
    open,
    totals,
    caption,
    sort = null,
  }: ReportTableOptions<Row>) {
    this.#columns = columns;
    this.#open = open ?? null;
    this.#rowKey = rowKey;
    this.#sort = sort;
    this.#totals = totals ?? null;

    this.#table.className = 'ui-report-table';

    // Made, not parsed: a `<caption>` parsed outside a table is dropped.
    if (caption) {
      const element = document.createElement('caption');

      element.textContent = caption;

      this.#table.append(element);
    }

    const head = document.createElement('thead'),
      headRow = document.createElement('tr');

    headRow.append(...columns.map((column) => this.#heading(column)));
    head.append(headRow);

    this.#table.append(head, this.#body, this.#foot);

    this.#markSort();
  }

  element(): HTMLTableElement {
    return this.#table;
  }

  /** The column it's sorted by, if any. */
  sort(): ReportSort | null {
    return this.#sort;
  }

  /** Sorts by `key`, the column's first way (see `sortFirst`), or the other way on a second click. */
  sortBy(key: string, direction?: ReportSort['direction']): void {
    const column = this.#columns.find((column) => column.key === key);

    if (!column?.sortValue) {
      return;
    }

    this.#sort = {
      key,
      direction:
        direction ??
        (this.#sort?.key === key
          ? this.#sort.direction === 'ascending'
            ? 'descending'
            : 'ascending'
          : column.sortFirst ??
            (column.kind === undefined || column.kind === 'text'
              ? 'ascending'
              : 'descending')),
    };

    this.#markSort();
    this.#order();
  }

  /** Draws `rows`, in the order chosen, keeping the focus on the row that had it. */
  update(rows: Row[]): void {
    const focused = this.#rows.find(({ element }) =>
        element.contains(document.activeElement)
      ),
      focusedKey = focused ? this.#rowKey(focused.row) : null;

    this.#rows = rows.map((row, index) => ({
      element: this.#row(row),
      row,
      index,
    }));

    this.#order();
    this.#drawTotals(rows);

    if (focusedKey !== null) {
      this.#rows
        .find(({ row }) => this.#rowKey(row) === focusedKey)
        ?.element.focus();
    }
  }

  #heading(column: ReportColumn<Row>): HTMLTableCellElement {
    const cell = document.createElement('th'),
      label = column.icon
        ? s(
            '<span class="ui-report-table-heading"></span>',
            column.icon(),
            s('<span class="visually-hidden"></span>', column.heading)
          )
        : s('<span class="ui-report-table-heading"></span>', column.heading);

    cell.scope = 'col';
    cell.classList.add(`ui-report-table-${column.kind ?? 'text'}`);

    if (column.icon) {
      cell.title = column.heading;
    }

    if (column.sortValue) {
      cell.append(
        h(
          s(
            '<button type="button" class="btn-bare ui-report-table-sort"></button>',
            label,
            s(
              '<span class="ui-report-table-sort-mark" aria-hidden="true"></span>'
            )
          ),
          {
            click: () => this.sortBy(column.key),
          }
        )
      );
    } else {
      cell.append(label);
    }

    this.#headings.set(column.key, cell);

    return cell;
  }

  #markSort(): void {
    this.#headings.forEach((cell, key) => {
      if (this.#sort?.key === key) {
        cell.setAttribute('aria-sort', this.#sort.direction);
      } else {
        cell.removeAttribute('aria-sort');
      }
    });
  }

  // Rows are moved, never rebuilt, so the filter's hidden rows stay hidden (#661).
  #order(): void {
    const column = this.#columns.find(({ key }) => key === this.#sort?.key),
      sortValue = column?.sortValue,
      sign = this.#sort?.direction === 'descending' ? -1 : 1,
      ordered = sortValue
        ? [...this.#rows].sort(
            (a, b) =>
              sign * compare(sortValue(a.row), sortValue(b.row)) ||
              a.index - b.index
          )
        : this.#rows;

    this.#body.replaceChildren(...ordered.map(({ element }) => element));
  }

  #row(row: Row): HTMLTableRowElement {
    const element = document.createElement('tr');

    element.append(
      ...this.#columns.map((column) => {
        const cell = document.createElement(column.header ? 'th' : 'td'),
          tone = column.tone?.(row) ?? null;

        if (column.header) {
          cell.setAttribute('scope', 'row');
        }

        cell.classList.add(`ui-report-table-${column.kind ?? 'text'}`);
        cell.dataset.column = column.key;

        if (tone !== null) {
          cell.classList.add(`ui-report-table-${tone}`);
        }

        fill(cell, column.cell(row), column.kind);

        return cell;
      })
    );

    const open = this.#open;

    if (open !== null) {
      element.classList.add('ui-report-table-opens');
      element.setAttribute('tabindex', '0');

      h(element, {
        click: () => open(row),
        keydown: (event: KeyboardEvent) => {
          if (event.target !== element || event.key !== 'Enter') {
            return;
          }

          event.preventDefault();

          open(row);
        },
      });
    }

    return element;
  }

  #drawTotals(rows: Row[]): void {
    if (this.#totals === null) {
      return;
    }

    const totals = this.#totals(rows),
      element = document.createElement('tr');

    element.append(
      ...this.#columns.map((column, index) => {
        const cell = document.createElement(index === 0 ? 'th' : 'td'),
          content =
            column.key in totals
              ? totals[column.key]
              : index === 0
              ? t('ReportTable.total')
              : null;

        if (index === 0) {
          cell.setAttribute('scope', 'row');
        }

        cell.classList.add(`ui-report-table-${column.kind ?? 'text'}`);

        fill(cell, content, column.kind);

        return cell;
      })
    );

    this.#foot.replaceChildren(element);
  }
}

export default ReportTable;
