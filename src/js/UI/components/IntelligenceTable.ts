import {
  IntelligenceDetails,
  IntelligenceRow,
} from '../../Engine/lib/intelligence';
import FilterableWindow from './FilterableWindow';
import Intelligence from '../../Engine/Requests/Intelligence';
import ReportTable from './lib/ReportTable';
import Transport from '../Transport';
import { advanceNames } from './lib/advances';
import { cityNameText } from './lib/city';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { unlessRequestFailed } from '../lib/unlessRequestFailed';

const plural = (civilization: string): string =>
  t(`${civilization}.plural`, {
    defaultValue: civilization,
    ns: 'civilization',
  });

const leaderName = (leader: string | null): string =>
  leader === null
    ? t('IntelligenceReport.unknown')
    : t(`Leader.${leader}.name`, { defaultValue: leader, ns: 'civilization' });

const governmentName = (row: IntelligenceRow): string =>
  row.details?.government
    ? t(`${row.details.government}.name`, {
        defaultValue: row.details.government,
        ns: 'government',
      })
    : '';

// Whose embassy: ours tells us their details (`details`), theirs tells them ours.
const embassy = ({ details, theirEmbassy }: IntelligenceRow): string =>
  t(
    `ReportTable.Intelligence.embassy-${
      details !== null
        ? theirEmbassy
          ? 'both'
          : 'ours'
        : theirEmbassy
        ? 'theirs'
        : 'none'
    }`
  );

const nation = (row: IntelligenceRow): HTMLElement => {
  const swatch = s('<span class="ui-report-swatch" aria-hidden="true"></span>');

  if (row.colors) {
    const [primary, secondary] = row.colors;

    swatch.style.setProperty('--owner-primary', primary);
    swatch.style.setProperty('--owner-secondary', secondary);
  }

  return s(
    '<span class="ui-report-nation"></span>',
    swatch,
    plural(row.civilization)
  );
};

const leader = (row: IntelligenceRow): HTMLElement => {
  const traits = row.details?.traits ?? [];

  return s(
    '<span></span>',
    leaderName(row.leader),
    ...(traits.length === 0
      ? []
      : [
          s(
            '<span class="ui-report-detail"></span>',
            ` (${traits
              .map((trait) =>
                t(`IntelligenceReport.trait.${trait}`, { defaultValue: trait })
              )
              .join(', ')})`
          ),
        ])
  );
};

const line = (text: string): HTMLElement => s('<p></p>', text);

/** What only an embassy tells you, under the table, for the civilization chosen in it. */
export const renderIntelligenceDetails = (row: IntelligenceRow): HTMLElement =>
  s(
    '<section class="ui-report-details"></section>',
    s(
      '<h3 class="ui-report-details-title"></h3>',
      t('IntelligenceReport.subject', {
        nation: plural(row.civilization),
        interpolation: { escapeValue: false },
      })
    ),
    ...(row.details === null
      ? [line(t('IntelligenceReport.no-embassy'))]
      : embassyDetails(row.details))
  );

const embassyDetails = ({
  capital,
  foreignAffairs,
  advances,
}: IntelligenceDetails): HTMLElement[] => [
  line(
    capital === null
      ? t('IntelligenceReport.no-capital')
      : t('IntelligenceReport.capital', {
          // As text, so `Xi'an` doesn't show as `Xi&#39;an`.
          city: cityNameText({
            name: capital.name,
            originalPlayer: { civilization: { _: capital.civilization } },
          }),
          interpolation: { escapeValue: false },
        })
  ),
  s(
    '<div></div>',
    s('<h4></h4>', t('IntelligenceReport.foreign-affairs')),
    ...(foreignAffairs.length === 0
      ? [line(t('IntelligenceReport.no-foreign-affairs'))]
      : foreignAffairs.map(({ civilization, atPeace }) =>
          line(
            t(`IntelligenceReport.${atPeace ? 'at-peace' : 'at-war'}`, {
              nation:
                civilization === null
                  ? t('Generic.unknown-civilization')
                  : t('IntelligenceReport.the', {
                      nation: plural(civilization),
                      interpolation: { escapeValue: false },
                    }),
              interpolation: { escapeValue: false },
            })
          )
        ))
  ),
  s(
    '<div></div>',
    s('<h4></h4>', t('IntelligenceReport.technologies')),
    line(
      advances.length === 0
        ? t('IntelligenceReport.no-technologies')
        : advanceNames(advances).join(', ')
    )
  ),
];

/**
 * The Intelligence Report (F3) under the new interface (#744): a row for each civilization we've met, with its leader,
 *  our relations, the embassies between us and, where we have one, its government, treasury and units. A row opens
 *  what our embassy tells us of its foreign affairs and technologies, under the table.
 */
export class IntelligenceTable extends FilterableWindow {
  #civilization: string | null;
  #details: HTMLElement = s(
    '<div class="ui-report-details-area" aria-live="polite"></div>'
  );
  #empty: HTMLElement = s(
    `<p class="ui-report-note" hidden>${t('IntelligenceReport.empty')}</p>`
  );
  #table: ReportTable<IntelligenceRow>;
  #transport: Transport;

  /** Every civilization you've met, or only `civilization`'s when it's given (as when an embassy is established). */
  constructor(transport: Transport, civilization: string | null = null) {
    // `intelligence-report` for the window's eyebrow, as the classic report has.
    super(t('IntelligenceReport.title'), s('<div></div>'), {
      classes: ['intelligence-report', 'ui-report'],
      rowSelector: 'tbody tr',
    });

    this.#civilization = civilization;
    this.#transport = transport;
    this.#table = new ReportTable<IntelligenceRow>({
      columns: [
        {
          key: 'civilization',
          heading: t('ReportTable.Intelligence.civilization'),
          header: true,
          cell: nation,
          sortValue: ({ civilization }) => plural(civilization),
        },
        {
          key: 'leader',
          heading: t('ReportTable.Intelligence.leader'),
          cell: leader,
          sortValue: ({ leader }) => leaderName(leader),
        },
        {
          key: 'relations',
          heading: t('ReportTable.Intelligence.relations'),
          cell: ({ atPeace }) =>
            t(`ReportTable.Intelligence.${atPeace ? 'peace' : 'war'}`),
          sortValue: ({ atPeace }) => (atPeace ? 1 : 0),
          sortFirst: 'ascending',
          tone: ({ atPeace }) => (atPeace ? null : 'negative'),
        },
        {
          key: 'embassy',
          heading: t('ReportTable.Intelligence.embassy'),
          cell: embassy,
          sortValue: embassy,
        },
        {
          key: 'government',
          heading: t('ReportTable.Intelligence.government'),
          cell: governmentName,
          sortValue: governmentName,
        },
        {
          key: 'treasury',
          heading: t('ReportTable.Intelligence.treasury'),
          kind: 'number',
          // Unknown without an embassy: nothing, rather than 0.
          cell: ({ details }) => details?.gold ?? null,
          sortValue: ({ details }) => details?.gold ?? -1,
        },
        {
          key: 'units',
          heading: t('ReportTable.Intelligence.units'),
          kind: 'number',
          cell: ({ details }) => details?.units ?? null,
          sortValue: ({ details }) => details?.units ?? -1,
        },
      ],
      label: t('IntelligenceReport.title'),
      rowKey: ({ civilization }) => civilization,
      open: (row) => this.#showDetails(row),
    });

    super.update(
      s('<div></div>', this.#empty, this.#table.element(), this.#details)
    );

    this.update();
  }

  table(): ReportTable<IntelligenceRow> {
    return this.#table;
  }

  /** Draws `rows`: what the engine sent. */
  show(rows: IntelligenceRow[]): void {
    const shown =
      this.#civilization === null
        ? rows
        : rows.filter((row) => row.civilization === this.#civilization);

    this.#empty.hidden = shown.length > 0;
    this.#table.element().hidden = shown.length === 0;
    this.#table.update(shown);

    // An embassy just established: what it tells us, straight away.
    if (this.#civilization !== null && shown.length === 1) {
      this.#showDetails(shown[0]);
    }

    this.reread();
  }

  #showDetails(row: IntelligenceRow): void {
    this.#details.replaceChildren(renderIntelligenceDetails(row));
  }

  // Asked for afresh each time the report opens; it doesn't follow the game while it's open.
  update(): void {
    this.#transport
      .request(new Intelligence())
      .then((rows: IntelligenceRow[]) => this.show(rows))
      // Not answered: the player has been told, and an empty report would only be in the way (#580).
      .catch((error) => {
        if (this.element().isConnected) {
          this.close();
        }

        unlessRequestFailed(error);
      });
  }
}

export default IntelligenceTable;
