import Civilopedia, { entryHtml, loadCivilopedia } from '../Civilopedia';
import { CivilopediaKind } from '../../../Engine/lib/civilopedia';
import Transport from '../../Transport';
import { escape } from './requirements';
import { h } from '../../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

/**
 * A choice's Civilopedia entry (#183), for the pane beside a choice list (#745): what it costs, what it needs and what
 *  it leads to, each linked to its own entry, and a link to the entry itself. Found by its save key, or by its class
 *  name among `kinds`, which is how a build list names what it offers. `null`, for an empty pane, where there's none.
 */
export const entryDetails = (
  transport: Transport,
  name: string,
  kinds: CivilopediaKind[]
): Promise<HTMLElement | null> =>
  loadCivilopedia(transport).then((data) => {
    const keyed = data.entries.get(name),
      entry =
        keyed !== undefined && kinds.includes(keyed.kind)
          ? keyed
          : Array.from(data.entries.values()).find(
              (entry) => entry.name === name && kinds.includes(entry.kind)
            );

    if (entry === undefined) {
      return null;
    }

    const details = s('<div class="ui-choice-entry"></div>');

    details.innerHTML = `${entryHtml(
      entry,
      data
    )}<p class="ui-choice-entry-more"><a href="#" class="civilopedia-link" data-key="${escape(
      entry.key
    )}">${t('ChoiceWindow.civilopedia')}</a></p>`;

    return h(details, {
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
  });

export default entryDetails;
