import {
  MilitaryLossRow,
  MilitaryReport as MilitaryReportData,
  MilitaryStatusRow,
} from '../../Engine/lib/military';
import Military from '../../Engine/Requests/Military';
import Transport from '../Transport';
import FilterableWindow from './FilterableWindow';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { unlessRequestFailed } from '../lib/unlessRequestFailed';

// The Military report (F2, #405), after v474.05's Military Advisor: MILITARY STATUS, each type of unit we have or are
//  building, then MILITARY LOSSES, each type we have lost. Our own only, as the original shows them without the cheat.

const unitName = (unit: string): string =>
  t(`${unit}.name`, { defaultValue: unit, ns: 'unit' });

const statusRow = ({
  unit,
  stats,
  active,
  inProduction,
}: MilitaryStatusRow): string =>
  `<tr><th scope="row">${unitName(unit)}</th><td class="stats">${t(
    'MilitaryReport.stats',
    stats
  )}</td><td class="active">${
    active > 0 ? t('MilitaryReport.active', { count: active }) : ''
  }</td><td class="in-production">${
    inProduction > 0
      ? t('MilitaryReport.in-production', { count: inProduction })
      : ''
  }</td></tr>`;

const lossRow = ({ unit, lost }: MilitaryLossRow): string =>
  `<tr><th scope="row">${unitName(unit)}</th><td class="lost">${t(
    'MilitaryReport.lost',
    { count: lost }
  )}</td></tr>`;

const section = (heading: string, rows: string[], empty: string): string =>
  `<section><h3>${heading}</h3>${
    rows.length === 0
      ? `<p>${empty}</p>`
      : `<table><tbody>${rows.join('')}</tbody></table>`
  }</section>`;

export const renderMilitaryReport = ({
  status,
  losses,
}: MilitaryReportData): HTMLElement =>
  s(
    `<div>${section(
      t('MilitaryReport.status'),
      status.map(statusRow),
      t('MilitaryReport.no-units')
    )}${section(
      t('MilitaryReport.losses'),
      losses.map(lossRow),
      t('MilitaryReport.no-losses')
    )}</div>`
  );

export class MilitaryReport extends FilterableWindow {
  #transport: Transport;

  constructor(transport: Transport) {
    super(t('MilitaryReport.title'), s('<div></div>'), {
      classes: 'military-report',
      groupSelector: 'section',
      rowSelector: 'tbody tr',
    });

    this.#transport = transport;

    this.update();
  }

  // Asked for afresh each time the report opens; it doesn't follow the game while it's open.
  update(): void {
    this.#transport
      .request(new Military())
      .then((report: MilitaryReportData) =>
        super.update(renderMilitaryReport(report))
      )
      // Not answered: the player has been told, and an empty report would only be in the way (#580).
      .catch((error) => {
        if (this.element().isConnected) {
          this.close();
        }

        unlessRequestFailed(error);
      });
  }
}

export default MilitaryReport;
