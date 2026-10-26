import {
  IntelligenceDetails,
  IntelligenceRow,
} from '../../Engine/lib/intelligence';
import Intelligence from '../../Engine/Requests/Intelligence';
import Transport from '../Transport';
import FilterableWindow from './FilterableWindow';
import { advanceNames } from './lib/advances';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { unlessRequestFailed } from '../lib/unlessRequestFailed';

// The intelligence report (F3, #58), after v474.05's (`Overlay_14.cs` `F14_0000_1164`): every civilization you've
//  met, with what an embassy tells you about it.

const plural = (civilization: string): string =>
  t(`${civilization}.plural`, {
    defaultValue: civilization,
    ns: 'civilization',
  });

const line = (html: string): HTMLElement => s(`<p>${html}</p>`);

const leaderLine = (
  leader: string | null,
  traits: string[] = []
): HTMLElement =>
  line(
    t('IntelligenceReport.leader', {
      leader:
        leader === null
          ? t('IntelligenceReport.unknown')
          : t(`Leader.${leader}.name`, {
              defaultValue: leader,
              ns: 'civilization',
            }),
      context: traits.length > 0 ? 'traits' : undefined,
      traits: traits
        .map((trait) =>
          t(`IntelligenceReport.trait.${trait}`, { defaultValue: trait })
        )
        .join(', '),
    })
  );

// What only an embassy tells you; the leader's line comes before it, with the leader's personality.
const renderDetails = ({
  capital,
  government,
  gold,
  units,
  foreignAffairs,
  advances,
}: IntelligenceDetails): HTMLElement[] => [
  line(
    capital === null
      ? t('IntelligenceReport.no-capital')
      : t('IntelligenceReport.capital', {
          city: t('Generic.city-name', capital),
        })
  ),
  line(
    t('IntelligenceReport.government', {
      government:
        government === null
          ? t('IntelligenceReport.unknown')
          : t(`${government}.name`, {
              defaultValue: government,
              ns: 'government',
            }),
    })
  ),
  line(t('IntelligenceReport.treasury', { gold })),
  line(t('IntelligenceReport.military', { count: units })),
  s(
    `<div class="foreign-affairs"><h4>${t(
      'IntelligenceReport.foreign-affairs'
    )}</h4></div>`,
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
                    }),
            })
          )
        ))
  ),
  s(
    `<div class="technologies"><h4>${t(
      'IntelligenceReport.technologies'
    )}</h4><p>${
      advances.length === 0
        ? t('IntelligenceReport.no-technologies')
        : advanceNames(advances).join(', ')
    }</p></div>`
  ),
];

export const renderIntelligenceRow = (row: IntelligenceRow): HTMLElement => {
  const element = s(
    `<section class="civilization${
      row.details === null ? ' no-embassy' : ''
    }"><h3>${t('IntelligenceReport.subject', {
      nation: plural(row.civilization),
    })}</h3></section>`,
    // What you know of anyone you've met, embassy or not (#419).
    leaderLine(row.leader, row.details?.traits),
    line(t(`IntelligenceReport.relations-${row.atPeace ? 'peace' : 'war'}`)),
    ...(row.theirEmbassy ? [line(t('IntelligenceReport.their-embassy'))] : []),
    ...(row.details === null
      ? [line(t('IntelligenceReport.no-embassy'))]
      : renderDetails(row.details))
  );

  if (row.colors) {
    const [primary, secondary] = row.colors;

    element.style.setProperty('--owner-primary', primary);
    element.style.setProperty('--owner-secondary', secondary);
  }

  return element;
};

export class IntelligenceReport extends FilterableWindow {
  #civilization: string | null;
  #transport: Transport;

  /** Every civilization you've met, or only `civilization`'s when it's given (as when an embassy is established). */
  constructor(transport: Transport, civilization: string | null = null) {
    super(t('IntelligenceReport.title'), s('<div></div>'), {
      classes: 'intelligence-report',
      rowSelector: 'section.civilization',
    });

    this.#civilization = civilization;
    this.#transport = transport;

    this.update();
  }

  // Asked for afresh each time the report opens; it doesn't follow the game while it's open.
  update(): void {
    this.#transport
      .request(new Intelligence())
      .then((rows: IntelligenceRow[]) => {
        const shown =
          this.#civilization === null
            ? rows
            : rows.filter((row) => row.civilization === this.#civilization);

        super.update(
          shown.length === 0
            ? s(`<p>${t('IntelligenceReport.empty')}</p>`)
            : s('<div></div>', ...shown.map(renderIntelligenceRow))
        );
      })
      // Not answered: the player has been told, and an empty report would only be in the way (#580).
      .catch((error) => {
        if (this.element().isConnected) {
          this.close();
        }

        unlessRequestFailed(error);
      });
  }
}

export default IntelligenceReport;
