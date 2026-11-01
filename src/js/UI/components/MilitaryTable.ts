import {
  MilitaryLossRow,
  MilitaryReport as MilitaryReportData,
  MilitaryStatusRow,
} from '../../Engine/lib/military';
import ReportTable, { ReportColumn } from './lib/ReportTable';
import { GlyphName, glyph } from '../lib/glyphs';
import Civilopedia from './Civilopedia';
import FilterableWindow from './FilterableWindow';
import Military from '../../Engine/Requests/Military';
import Transport from '../Transport';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { unlessRequestFailed } from '../lib/unlessRequestFailed';

const unitName = (unit: string): string =>
  t(`${unit}.name`, { defaultValue: unit, ns: 'unit' });

const unitColumn = <Row extends { unit: string }>(): ReportColumn<Row> => ({
  key: 'unit',
  heading: t('ReportTable.Military.unit'),
  header: true,
  cell: ({ unit }) => unitName(unit),
  sortValue: ({ unit }) => unitName(unit),
});

const statColumn = (
  key: keyof MilitaryStatusRow['stats'],
  icon: GlyphName
): ReportColumn<MilitaryStatusRow> => ({
  key,
  heading: t(`ReportTable.Military.${key}`),
  icon: () => s(`<span class="ui-report-glyph">${glyph(icon)}</span>`),
  kind: 'number',
  cell: ({ stats }) => stats[key],
  sortValue: ({ stats }) => stats[key],
});

const countColumn = <Row>(
  key: string,
  count: (row: Row) => number
): ReportColumn<Row> => ({
  key,
  heading: t(`ReportTable.Military.${key}`),
  kind: 'number',
  // Nothing rather than 0, so what there is stands out.
  cell: (row) => (count(row) > 0 ? count(row) : null),
  sortValue: count,
});

/**
 * The Military report (F2) under the new interface (#744): each type of unit we have or are building, with its
 *  figures, then each type we have lost. A row opens the unit's Civilopedia entry.
 */
export class MilitaryTable extends FilterableWindow {
  #losses: ReportTable<MilitaryLossRow>;
  #noLosses: HTMLElement = s(
    `<p class="ui-report-note" hidden>${t('MilitaryReport.no-losses')}</p>`
  );
  #noUnits: HTMLElement = s(
    `<p class="ui-report-note" hidden>${t('MilitaryReport.no-units')}</p>`
  );
  #status: ReportTable<MilitaryStatusRow>;
  #transport: Transport;

  constructor(transport: Transport) {
    // `military-report` for the window's eyebrow, as the classic report has.
    super(t('MilitaryReport.title'), s('<div></div>'), {
      classes: ['military-report', 'ui-report'],
      rowSelector: 'tbody tr',
    });

    const open = ({ key }: { key: string }) => Civilopedia.open(transport, key);

    this.#transport = transport;
    this.#status = new ReportTable<MilitaryStatusRow>({
      caption: t('MilitaryReport.status'),
      columns: [
        unitColumn(),
        statColumn('attack', 'stat-attack'),
        statColumn('defence', 'stat-defence'),
        statColumn('movement', 'stat-moves'),
        statColumn('visibility', 'stat-visibility'),
        countColumn('active', ({ active }) => active),
        countColumn('in-production', ({ inProduction }) => inProduction),
      ],
      rowKey: ({ key }) => key,
      open,
    });
    this.#losses = new ReportTable<MilitaryLossRow>({
      caption: t('MilitaryReport.losses'),
      columns: [unitColumn(), countColumn('lost', ({ lost }) => lost)],
      rowKey: ({ key }) => key,
      open,
      totals: (rows) => ({
        lost: rows.reduce((total, { lost }) => total + lost, 0),
      }),
    });

    // Put in once, and filled when the report comes.
    super.update(
      s(
        '<div class="ui-report-tables"></div>',
        s(
          '<div class="ui-report-section"></div>',
          this.#status.element(),
          this.#noUnits
        ),
        s(
          '<div class="ui-report-section"></div>',
          this.#losses.element(),
          this.#noLosses
        )
      )
    );

    this.update();
  }

  status(): ReportTable<MilitaryStatusRow> {
    return this.#status;
  }

  losses(): ReportTable<MilitaryLossRow> {
    return this.#losses;
  }

  /** Draws `report`: what the engine sent. */
  show({ status, losses }: MilitaryReportData): void {
    this.#status.update(status);
    this.#losses.update(losses);

    this.#noUnits.hidden = status.length > 0;
    this.#noLosses.hidden = losses.length > 0;
    this.#losses.element().hidden = losses.length === 0;

    this.reread();
  }

  // Asked for afresh each time the report opens; it doesn't follow the game while it's open.
  update(): void {
    this.#transport
      .request(new Military())
      .then((report: MilitaryReportData) => this.show(report))
      // Not answered: the player has been told, and an empty report would only be in the way (#580).
      .catch((error) => {
        if (this.element().isConnected) {
          this.close();
        }

        unlessRequestFailed(error);
      });
  }
}

export default MilitaryTable;
