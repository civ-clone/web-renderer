import { City as CityData, Player } from '@civ-clone/ui-protocol/types';
import ReportTable from '@civ-clone/ui-component-report-table/ReportTable';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import Window from '@civ-clone/ui-component-window/Window';
import Wonders from '@civ-clone/ui-protocol/Requests/Wonders';
import { WondersRow } from '@civ-clone/ui-protocol/reports';
import buildingIcon from '@civ-clone/ui-assets/components/lib/buildingIcon';
import {
  cityNameText,
  viewCityText,
} from '@civ-clone/ui-client/components/lib/city';
import { ownCityNamed } from './TopCitiesTable';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { unlessRequestFailed } from '@civ-clone/ui-client/lib/unlessRequestFailed';

const wonderName = (wonder: string): string =>
  t(`${wonder}.name`, { defaultValue: wonder, ns: 'wonder' });

// A lost Wonder has no city: it says so in its place.
const cityLabel = (row: WondersRow): string =>
  row.destroyed
    ? t('WondersReport.destroyed-state')
    : row.city === null
    ? t('TopCitiesReport.unknown-city')
    : cityNameText({
        name: row.city.name,
        originalPlayer: { civilization: { _: row.city.civilization } },
      });

const ownerLabel = (row: WondersRow): string =>
  row.destroyed
    ? ''
    : row.owner === null
    ? t('Generic.unknown-civilization')
    : t(`${row.owner.civilization}.plural`, {
        defaultValue: row.owner.civilization,
        ns: 'civilization',
      });

// The owner's colours and name, as the other tables show a civilization; nothing for a lost Wonder, which has none.
const owner = (row: WondersRow): HTMLElement | null => {
  if (row.destroyed) {
    return null;
  }

  const swatch = s('<span class="ui-report-swatch" aria-hidden="true"></span>');

  if (row.owner?.colors) {
    const [primary, secondary] = row.owner.colors;

    swatch.style.setProperty('--owner-primary', primary);
    swatch.style.setProperty('--owner-secondary', secondary);
  }

  return s(
    '<span class="ui-report-nation"></span>',
    swatch,
    ownerLabel(row),
    // Yours, for a screen reader, as the sidebar's Power list says it; the row is marked for the eye.
    ...(row.own
      ? [s('<span class="visually-hidden"></span>', ` ${t('ReportTable.you')}`)]
      : [])
  );
};

const wonder = (row: WondersRow): HTMLElement =>
  s(
    '<span class="ui-report-wonder"></span>',
    buildingIcon(row.wonder, true),
    wonderName(row.wonder)
  );

/** One of your own cities, for a row of yours. */
export const ownWonderCity = (
  row: WondersRow,
  player: Player
): CityData | null =>
  !row.own || row.city === null ? null : ownCityNamed(row.city, player);

/**
 * The Wonders of the World (F7, #992) under the new interface: every Wonder built, in the Wonders' own order, with its
 *  city and that city's owner, the ones lost with their city, and yours marked, with a View button.
 */
export class WondersTable extends Window {
  #empty: HTMLElement = s(
    `<p class="ui-report-note" hidden>${t('WondersReport.empty')}</p>`
  );
  #player: Player;
  #table: ReportTable<WondersRow>;
  #transport: Transport;

  constructor(player: Player, portal: Portal, transport: Transport) {
    // `wonders-report` for the window's eyebrow, as the classic report has.
    super(t('WondersReport.title'), s('<div></div>'), {
      classes: ['wonders-report', 'ui-report'],
    });

    this.#player = player;
    this.#transport = transport;
    this.#table = new ReportTable<WondersRow>({
      columns: [
        {
          key: 'wonder',
          heading: t('ReportTable.Wonders.wonder'),
          header: true,
          cell: wonder,
          sortValue: ({ wonder }) => wonderName(wonder),
        },
        {
          key: 'city',
          heading: t('ReportTable.city'),
          cell: cityLabel,
          sortValue: cityLabel,
          tone: ({ destroyed }) => (destroyed ? 'negative' : null),
        },
        {
          key: 'civilization',
          heading: t('ReportTable.Intelligence.civilization'),
          cell: owner,
          sortValue: ownerLabel,
        },
        {
          key: 'view',
          heading: t('ReportTable.Happiness.view'),
          action: {
            label: t('ReportTable.Happiness.view'),
            name: (row) => {
              const city = ownWonderCity(row, this.#player);

              return city === null ? null : viewCityText(city);
            },
            run: (row) => {
              const city = ownWonderCity(row, this.#player);

              if (city !== null) {
                portal.openCity(city);
              }
            },
          },
        },
      ],
      label: t('WondersReport.title'),
      current: ({ own }) => own,
      // Each Wonder is built once.
      rowKey: ({ wonder }) => wonder,
    });

    super.update(s('<div></div>', this.#empty, this.#table.element()));

    this.update();
  }

  table(): ReportTable<WondersRow> {
    return this.#table;
  }

  /** Draws `rows`: what the engine sent. */
  show(rows: WondersRow[]): void {
    this.#empty.hidden = rows.length > 0;
    this.#table.element().hidden = rows.length === 0;
    this.#table.update(rows);
  }

  // Asked for afresh each time the report opens; it doesn't follow the game while it's open.
  override update(): void {
    this.#transport
      .request(new Wonders())
      .then((rows: WondersRow[]) => this.show(rows))
      // Not answered: the player has been told, and an empty report would only be in the way (#580).
      .catch((error) => {
        if (this.element().isConnected) {
          this.close();
        }

        unlessRequestFailed(error);
      });
  }
}

export default WondersTable;
