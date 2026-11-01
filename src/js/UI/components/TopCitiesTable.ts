import { City as CityData, Player } from '../types';
import ReportTable, { rowAction } from './lib/ReportTable';
import Portal from './Portal';
import TopCities from '../../Engine/Requests/TopCities';
import { TopCitiesRow } from '../../Engine/lib/topCities';
import Transport from '../Transport';
import Window from './Window';
import { cityNameText, viewCityText } from './lib/city';
import { renderCitizenCounts } from './lib/cityYields';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { unlessRequestFailed } from '../lib/unlessRequestFailed';

// Up to ten rather than Civ1's five (#124): there are fewer early in the game.
const limit = 10;

const cityLabel = (row: TopCitiesRow): string =>
  row.city === null
    ? t('TopCitiesReport.unknown-city')
    : cityNameText({
        name: row.city.name,
        originalPlayer: { civilization: { _: row.city.civilization } },
      });

const ownerLabel = (row: TopCitiesRow): string =>
  row.owner === null
    ? t('Generic.unknown-civilization')
    : t(`${row.owner.civilization}.plural`, {
        defaultValue: row.owner.civilization,
        ns: 'civilization',
      });

const owner = (row: TopCitiesRow): HTMLElement => {
  const swatch = s('<span class="ui-report-swatch" aria-hidden="true"></span>');

  if (row.owner?.colors) {
    const [primary, secondary] = row.owner.colors;

    swatch.style.setProperty('--owner-primary', primary);
    swatch.style.setProperty('--owner-secondary', secondary);
  }

  return s('<span class="ui-report-nation"></span>', swatch, ownerLabel(row));
};

const wonderName = (wonder: string): string =>
  t(`${wonder}.name`, { defaultValue: wonder, ns: 'wonder' });

/**
 * One of your own cities, for a row: the rows carry no ids (a city you haven't seen can't be matched to anything), so
 *  it's found by its name and its founder among your cities, and only when you own it. Two of yours with the same
 *  name and founder are told apart by their size; when that doesn't settle it, there's no match rather than a guess.
 */
export const ownCity = (row: TopCitiesRow, player: Player): CityData | null => {
  if (row.city === null || row.owner?.civilization !== player.civilization._) {
    return null;
  }

  const named = player.cities.filter(
      (city) =>
        city.name === row.city!.name &&
        city.originalPlayer.civilization._ === row.city!.civilization
    ),
    candidates =
      named.length > 1
        ? named.filter((city) => city.growth.size === row.size)
        : named;

  return candidates.length === 1 ? candidates[0] : null;
};

/**
 * Top Cities in the World (F8) under the new interface (#744): the ten best cities by Civ1's reckoning, with their
 *  owners, citizens and wonders, and a View button for your own.
 */
export class TopCitiesTable extends Window {
  #empty: HTMLElement = s(
    `<p class="ui-report-note" hidden>${t('TopCitiesReport.empty')}</p>`
  );
  #player: Player;
  #table: ReportTable<TopCitiesRow>;
  #transport: Transport;

  constructor(player: Player, portal: Portal, transport: Transport) {
    // `top-cities-report` for the window's eyebrow, as the classic report has.
    super(t('TopCitiesReport.title'), s('<div></div>'), {
      classes: ['top-cities-report', 'ui-report'],
    });

    this.#player = player;
    this.#transport = transport;
    this.#table = new ReportTable<TopCitiesRow>({
      columns: [
        {
          key: 'rank',
          heading: t('ReportTable.TopCities.rank'),
          kind: 'number',
          cell: ({ rank }) => rank,
          sortValue: ({ rank }) => rank,
          sortFirst: 'ascending',
        },
        {
          key: 'city',
          heading: t('ReportTable.city'),
          header: true,
          cell: cityLabel,
          sortValue: cityLabel,
        },
        {
          key: 'civilization',
          heading: t('ReportTable.Intelligence.civilization'),
          cell: owner,
          sortValue: ownerLabel,
        },
        {
          key: 'size',
          heading: t('ReportTable.CityStatus.size'),
          kind: 'number',
          cell: ({ size }) => size,
          sortValue: ({ size }) => size,
        },
        {
          key: 'citizens',
          heading: t('ReportTable.Happiness.citizens'),
          // An anonymous row gets a fixed pattern of faces, so nothing about how it's drawn comes from the city's name.
          cell: (row) =>
            renderCitizenCounts(row.citizens, row.city?.name ?? 'unknown'),
        },
        {
          key: 'wonders',
          heading: t('ReportTable.TopCities.wonders'),
          cell: ({ wonders }) => wonders.map(wonderName).join(', '),
          sortValue: ({ wonders }) => wonders.length,
          sortFirst: 'descending',
        },
        {
          key: 'view',
          heading: t('ReportTable.Happiness.view'),
          cell: (row) => {
            const city = ownCity(row, this.#player);

            return city === null
              ? null
              : rowAction(
                  t('ReportTable.Happiness.view'),
                  viewCityText(city),
                  () => portal.openCity(city)
                );
          },
        },
      ],
      label: t('TopCitiesReport.title'),
      // The rank: a row is a place in the list, not a city it could be matched to.
      rowKey: ({ rank }) => `${rank}`,
    });

    super.update(s('<div></div>', this.#empty, this.#table.element()));

    this.update();
  }

  table(): ReportTable<TopCitiesRow> {
    return this.#table;
  }

  /** Draws `rows`: what the engine sent. */
  show(rows: TopCitiesRow[]): void {
    this.#empty.hidden = rows.length > 0;
    this.#table.element().hidden = rows.length === 0;
    this.#table.update(rows);
  }

  // Asked for afresh each time the report opens; it doesn't follow the game while it's open.
  update(): void {
    this.#transport
      .request(new TopCities(limit))
      .then((rows: TopCitiesRow[]) => this.show(rows))
      // Not answered: the player has been told, and an empty report would only be in the way (#580).
      .catch((error) => {
        if (this.element().isConnected) {
          this.close();
        }

        unlessRequestFailed(error);
      });
  }
}

export default TopCitiesTable;
