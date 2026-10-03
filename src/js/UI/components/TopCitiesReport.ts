import TopCities from '../../Engine/Requests/TopCities';
import { TopCitiesRow } from '../../Engine/lib/topCities';
import Transport from '../Transport';
import Window from './Window';
import { renderCitizenCounts } from './lib/cityYields';
import { s } from '@dom111/element';
import { t } from 'i18next';

// Up to ten rather than Civ1's five (#124): there are fewer early in the game.
const limit = 10;

const cityLabel = (row: TopCitiesRow): string =>
  row.city === null
    ? t('TopCitiesReport.unknown-city')
    : t('Generic.city-name', {
        civilization: row.city.civilization,
        name: row.city.name,
      });

const ownerLabel = (row: TopCitiesRow): string =>
  row.owner === null
    ? t('Generic.unknown-civilization')
    : t('Generic.civilization-name.plural', {
        civilization: row.owner.civilization,
        player: { civilization: { _: row.owner.civilization } },
      });

const buildRow = (row: TopCitiesRow): HTMLElement => {
  const element = s(
    `<div class="city${
      row.owner === null ? ' unknown-owner' : ''
    }"><div class="name">${t('TopCitiesReport.row', {
      rank: row.rank,
      city: cityLabel(row),
      civilization: ownerLabel(row),
      interpolation: { escapeValue: false },
    })}</div></div>`,
    // An anonymous row gets a fixed pattern of faces, so nothing about how it's drawn can come from the city's name.
    renderCitizenCounts(row.citizens, row.city?.name ?? 'unknown'),
    s(
      `<div class="wonders">${row.wonders
        .map(
          (wonder) =>
            `<span class="wonder">${t(`${wonder}.name`, {
              defaultValue: wonder,
              ns: 'wonder',
            })}</span>`
        )
        .join('')}</div>`
    )
  );

  if (row.owner?.colors) {
    const [primary, secondary] = row.owner.colors;

    element.style.setProperty('--owner-primary', primary);
    element.style.setProperty('--owner-secondary', secondary);
  }

  return element;
};

export class TopCitiesReport extends Window {
  #transport: Transport;

  constructor(transport: Transport) {
    super(t('TopCitiesReport.title'), s('<div></div>'), {
      classes: 'top-cities-report',
    });

    this.#transport = transport;

    this.update();
  }

  // Asked for afresh each time the report opens; it doesn't follow the game while it's open.
  update(): void {
    this.#transport
      .request(new TopCities(limit))
      .then((rows: TopCitiesRow[]) =>
        super.update(
          rows.length === 0
            ? s(`<p>${t('TopCitiesReport.empty')}</p>`)
            : s('<div></div>', ...rows.map(buildRow))
        )
      );
  }
}

export default TopCitiesReport;
