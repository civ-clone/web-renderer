import Civilopedia, { CivilopediaData, loadCivilopedia } from './Civilopedia';
import { classLink, subjectLine, whereHtml } from './lib/requirements';
import { CityBuild } from '../types';
import CityBuildUnavailable from '../../Engine/Requests/CityBuildUnavailable';
import { UnavailableBuildItem } from '../../Engine/lib/civilopedia';
import Transport from '../Transport';
import Window from './Window';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

// Why a city can't build each item it can't (#183), from the build list's Can't build button: the rules that refuse
//  it, worded from the requirement entries (#37) that share their ids, each item linked to its Civilopedia entry. A
//  rule with no entry gives no reason beyond "not available in this city".

/** Each refusing rule with a requirement entry as a line of HTML, or "not available" when none has one. */
export const reasons = (
  item: UnavailableBuildItem,
  { entries, requirements }: CivilopediaData
): string[] => {
  const lines = item.refusedBy.flatMap((id) => {
    const requirement = requirements.get(id);

    return requirement
      ? [
          subjectLine(requirement, entries),
          whereHtml(requirement, entries),
        ].filter((line): line is string => line !== null)
      : [];
  });

  return lines.length === 0
    ? [t('CityBuildUnavailable.other')]
    : Array.from(new Set(lines));
};

export const unavailableHtml = (
  items: UnavailableBuildItem[],
  data: CivilopediaData
): string =>
  items.length === 0
    ? `<p>${t('CityBuildUnavailable.none')}</p>`
    : `<ul class="unavailable">${items
        .map(
          (item) =>
            `<li><span class="item">${classLink(
              item.key,
              data.entries
            )}</span><ul class="reasons">${reasons(item, data)
              .map((reason) => `<li>${reason}</li>`)
              .join('')}</ul></li>`
        )
        .join('')}</ul>`;

export class CityBuildUnavailableWindow extends Window {
  constructor(cityBuild: CityBuild, transport: Transport) {
    super(
      t('CityBuildUnavailable.title', { city: cityBuild.city }),
      s(`<p>${t('Civilopedia.loading')}</p>`),
      {
        classes: 'city-build-unavailable',
      }
    );

    Promise.all([
      transport.request(new CityBuildUnavailable(cityBuild.id)),
      loadCivilopedia(transport),
    ]).then(
      ([items, data]) => {
        super.update(s(`<div>${unavailableHtml(items, data)}</div>`));

        h(this.element(), {
          click: (event: Event) => {
            const link = (event.target as HTMLElement).closest?.(
              'a.civilopedia-link'
            ) as HTMLElement | null;

            if (!link) {
              return;
            }

            event.preventDefault();

            Civilopedia.open(transport, link.dataset.key!);
          },
        });
      },
      () => super.update(s(`<p>${t('Civilopedia.failed')}</p>`))
    );
  }
}

export default CityBuildUnavailableWindow;
