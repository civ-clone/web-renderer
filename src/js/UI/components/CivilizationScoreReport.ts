import {
  CivilizationScore as CivilizationScoreResult,
  CivilizationScoreTerm,
} from '../../Engine/lib/civilizationScore';
import CivilizationScore from '../../Engine/Requests/CivilizationScore';
import Transport from '../Transport';
import Window from './Window';
import { s } from '@dom111/element';
import { t } from 'i18next';

// Built with `createElement`: a `<tr>` parsed on its own, outside a table, loses its cells.
const buildRow = (
  className: string,
  label: string,
  detail: string,
  value: number
): HTMLTableRowElement => {
  const row = document.createElement('tr'),
    labelCell = document.createElement('td'),
    valueCell = document.createElement('td');

  row.className = className;
  labelCell.textContent = label;

  if (detail !== '') {
    const detailElement = document.createElement('span');

    detailElement.className = 'detail';
    detailElement.textContent = detail;
    labelCell.append(detailElement);
  }

  valueCell.className = 'value';
  valueCell.textContent = value.toLocaleString();

  row.append(labelCell, valueCell);

  return row;
};

const buildTerm = ({ term, value }: CivilizationScoreTerm) =>
  buildRow(
    `term ${term}`,
    t(`CivilizationScoreReport.term.${term}`, { defaultValue: term }),
    t(`CivilizationScoreReport.term.${term}.detail`, { defaultValue: '' }),
    value
  );

// The player's Civilization Score, as Civ1's World menu showed it (#149). The engine adds it up; this only draws it.
export class CivilizationScoreReport extends Window {
  #transport: Transport;

  constructor(transport: Transport) {
    super(t('CivilizationScoreReport.title'), s('<div></div>'), {
      classes: 'civilization-score-report',
    });

    this.#transport = transport;

    this.update();
  }

  // Asked for afresh each time the report opens; it doesn't follow the game while it's open.
  update(): void {
    this.#transport
      .request(new CivilizationScore())
      .then(({ terms, total }: CivilizationScoreResult) =>
        super.update(
          s(
            '<table class="terms"></table>',
            ...terms.map(buildTerm),
            buildRow('total', t('CivilizationScoreReport.total'), '', total)
          )
        )
      );
  }
}

export default CivilizationScoreReport;
