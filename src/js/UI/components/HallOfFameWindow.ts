import { HallOfFameEntry, hallOfFame } from '../lib/hallOfFame';
import { s } from '@dom111/element';
import { t } from 'i18next';
import Window from './Window';

// A year as the status window shows it: 4000 BCE, 1 CE.
export const yearLabel = (year: number): string =>
  t('GameDetails.year', {
    year: Math.abs(year) || 1,
    context: year < 0 ? 'bce' : 'ce',
  });

const cell = (text: string, className: string = ''): HTMLTableCellElement => {
  const element = document.createElement('td');

  element.className = className;
  element.textContent = text;

  return element;
};

// Built with `createElement`: a `<tr>` parsed on its own, outside a table, loses its cells.
const row = (entry: HallOfFameEntry, current: boolean): HTMLTableRowElement => {
  const element = document.createElement('tr');

  if (current) {
    element.className = 'current';
  }

  element.append(
    cell(
      t('HallOfFame.leader', {
        // Set as text, so nothing is escaped for HTML.
        interpolation: { escapeValue: false },
        leader:
          entry.leader === null
            ? ''
            : t(`Leader.${entry.leader}.name`, {
                defaultValue: entry.leader,
                ns: 'civilization',
              }),
        nation: t(`${entry.civilization}.plural`, {
          defaultValue: entry.civilization,
          ns: 'civilization',
        }),
      })
    ),
    cell(
      entry.difficulty === null
        ? ''
        : t(`${entry.difficulty}.name`, {
            defaultValue: entry.difficulty,
            ns: 'difficulty',
          })
    ),
    cell(
      t(`HallOfFame.reason.${entry.reason}`, { defaultValue: entry.reason })
    ),
    cell(yearLabel(entry.year)),
    cell(entry.score.toLocaleString(), 'value'),
    cell(
      t('HallOfFame.rating', {
        interpolation: { escapeValue: false },
        rating: entry.rating,
      }),
      'value'
    )
  );

  return element;
};

// The Hall of Fame's games, best first, with this game's marked when it's there.
export const hallOfFameTable = (
  entries: HallOfFameEntry[],
  currentId: string | null = null
): HTMLTableElement => {
  const table = s<HTMLTableElement>('<table class="hall-of-fame"></table>'),
    header = document.createElement('tr');

  [
    'HallOfFame.column.civilization',
    'HallOfFame.column.difficulty',
    'HallOfFame.column.ending',
    'HallOfFame.column.year',
    'HallOfFame.column.score',
    'HallOfFame.column.rating',
  ].forEach((key) => {
    const th = document.createElement('th');

    th.textContent = t(key);
    header.append(th);
  });

  table.append(
    header,
    ...entries.map((entry) => row(entry, entry.id === currentId))
  );

  return table;
};

// The Hall of Fame from the main menu (#179).
export class HallOfFameWindow extends Window {
  constructor() {
    const entries = hallOfFame();

    super(
      t('HallOfFame.title'),
      entries.length === 0
        ? s(`<p>${t('HallOfFame.empty')}</p>`)
        : hallOfFameTable(entries),
      {
        classes: 'hall-of-fame-window',
      }
    );
  }
}

export default HallOfFameWindow;
