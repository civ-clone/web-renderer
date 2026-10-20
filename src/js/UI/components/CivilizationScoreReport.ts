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

// The score, term by term, then the conquest bonus when there is one (#176), then the total.
export const scoreTable = ({
  terms,
  bonus,
  total,
}: CivilizationScoreResult): HTMLTableElement =>
  s<HTMLTableElement>(
    '<table class="terms"></table>',
    ...terms.map(buildTerm),
    ...(bonus === null
      ? []
      : [
          buildRow(
            'term bonus',
            t('CivilizationScoreReport.bonus'),
            t('CivilizationScoreReport.bonus.detail'),
            bonus
          ),
        ]),
    buildRow('total', t('CivilizationScoreReport.total'), '', total)
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
      .then((score: CivilizationScoreResult) =>
        super.update(
          s(
            '<div></div>',
            ...(score.scoringComplete
              ? [
                  s(
                    `<p class="scoring-complete">${t(
                      'CivilizationScoreReport.scoring-complete'
                    )}</p>`
                  ),
                ]
              : []),
            scoreTable(score)
          )
        )
      );
  }
}

export default CivilizationScoreReport;
