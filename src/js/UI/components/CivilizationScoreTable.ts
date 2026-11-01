import {
  CivilizationScore as CivilizationScoreResult,
  CivilizationScoreTerm,
} from '../../Engine/lib/civilizationScore';
import CivilizationScore from '../../Engine/Requests/CivilizationScore';
import ReportTable from './lib/ReportTable';
import Transport from '../Transport';
import Window from './Window';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { unlessRequestFailed } from '../lib/unlessRequestFailed';

// A row of the score: each term, and the conquest bonus as one more.
export interface ScoreRow {
  term: string;
  label: string;
  detail: string;
  value: number;
}

export const scoreRows = ({
  terms,
  bonus,
}: CivilizationScoreResult): ScoreRow[] => [
  ...terms.map(
    ({ term, value }: CivilizationScoreTerm): ScoreRow => ({
      term,
      label: t(`CivilizationScoreReport.term.${term}`, { defaultValue: term }),
      detail: t(`CivilizationScoreReport.term.${term}.detail`, {
        defaultValue: '',
      }),
      value,
    })
  ),
  ...(bonus === null
    ? []
    : [
        {
          term: 'bonus',
          label: t('CivilizationScoreReport.bonus'),
          detail: t('CivilizationScoreReport.bonus.detail'),
          value: bonus,
        },
      ]),
];

/**
 * The Civilization Score (F9) under the new interface (#744): each term, what it counts and its points, the conquest
 *  bonus when there is one, and the total underneath. The engine adds it up; this only draws it (#149).
 */
export class CivilizationScoreTable extends Window {
  #complete: HTMLElement = s(
    `<p class="ui-report-note" hidden>${t(
      'CivilizationScoreReport.scoring-complete'
    )}</p>`
  );
  #table: ReportTable<ScoreRow>;
  #total = 0;
  #transport: Transport;

  constructor(transport: Transport) {
    // `civilization-score-report` for the window's eyebrow, as the classic report has.
    super(t('CivilizationScoreReport.title'), s('<div></div>'), {
      classes: ['civilization-score-report', 'ui-report'],
    });

    this.#transport = transport;
    this.#table = new ReportTable<ScoreRow>({
      columns: [
        {
          key: 'term',
          heading: t('ReportTable.Score.term'),
          header: true,
          cell: ({ label }) => label,
          sortValue: ({ label }) => label,
        },
        {
          key: 'detail',
          heading: t('ReportTable.Score.detail'),
          cell: ({ detail }) =>
            s('<span class="ui-report-detail"></span>', detail),
        },
        {
          key: 'points',
          heading: t('ReportTable.Score.points'),
          kind: 'number',
          cell: ({ value }) => value,
          sortValue: ({ value }) => value,
          // Pollution counts against you.
          tone: ({ value }) => (value < 0 ? 'negative' : null),
        },
      ],
      label: t('CivilizationScoreReport.title'),
      rowKey: ({ term }) => term,
      // The engine's total: the bonus replaces the terms' sum when it's higher, so it isn't the column's sum.
      totals: () => ({
        term: t('CivilizationScoreReport.total'),
        points: this.#total,
      }),
    });

    super.update(s('<div></div>', this.#complete, this.#table.element()));

    this.update();
  }

  table(): ReportTable<ScoreRow> {
    return this.#table;
  }

  /** Draws `score`: what the engine sent. */
  show(score: CivilizationScoreResult): void {
    this.#total = score.total;
    this.#complete.hidden = !score.scoringComplete;
    this.#table.update(scoreRows(score));
  }

  // Asked for afresh each time the report opens; it doesn't follow the game while it's open.
  update(): void {
    this.#transport
      .request(new CivilizationScore())
      .then((score: CivilizationScoreResult) => this.show(score))
      // Not answered: the player has been told, and an empty report would only be in the way (#580).
      .catch((error) => {
        if (this.element().isConnected) {
          this.close();
        }

        unlessRequestFailed(error);
      });
  }
}

export default CivilizationScoreTable;
