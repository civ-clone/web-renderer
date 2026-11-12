import Transport from '@civ-clone/ui-client/Transport';
import Window from '@civ-clone/ui-component-window/Window';
import Wonders from '@civ-clone/ui-protocol/Requests/Wonders';
import { WondersRow } from '@civ-clone/ui-protocol/reports';
import buildingIcon from '@civ-clone/ui-assets/components/lib/buildingIcon';
import { cityNameText } from '@civ-clone/ui-client/components/lib/city';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { unlessRequestFailed } from '@civ-clone/ui-client/lib/unlessRequestFailed';

// As text, for a text node: nothing here is HTML.
const text = { interpolation: { escapeValue: false } };

const wonderName = (wonder: string): string =>
  t(`${wonder}.name`, { defaultValue: wonder, ns: 'wonder' });

/**
 * One row's sentence, as Civ1 words it: "The Pyramids of Thebes. (Egyptian)", "Hoover Dam in Washington. (American)"
 *  or "The Colossus (Destroyed)". Which Wonders take "The … of" is the translations' to say, by the Wonder's name as
 *  the context (`WondersReport.place_Pyramids`), so nothing here knows one Wonder from another.
 */
export const wondersRowText = (row: WondersRow): string => {
  const wonder = t('WondersReport.wonder', {
    ...text,
    context: row.wonder,
    wonder: wonderName(row.wonder),
  });

  if (row.destroyed) {
    return t('WondersReport.destroyed', { ...text, wonder });
  }

  return t('WondersReport.standing', {
    ...text,
    // A city you haven't seen isn't named.
    place:
      row.city === null
        ? wonder
        : t('WondersReport.place', {
            ...text,
            context: row.wonder,
            wonder: wonderName(row.wonder),
            city: cityNameText({
              name: row.city.name,
              originalPlayer: { civilization: { _: row.city.civilization } },
            }),
          }),
    civilization:
      row.owner === null
        ? t('Generic.unknown-civilization')
        : t('Generic.civilization-name.name', {
            ...text,
            civilization: row.owner.civilization,
            player: { civilization: { _: row.owner.civilization } },
          }),
  });
};

const buildRow = (row: WondersRow): HTMLElement => {
  const element = s(
    `<div class="wonder${row.destroyed ? ' destroyed' : ''}${
      !row.destroyed && row.owner === null ? ' unknown-owner' : ''
    }"></div>`,
    buildingIcon(row.wonder, true),
    s('<div class="name"></div>', wondersRowText(row))
  );

  // In the owner's colours, as Civ1 boxes it; a lost Wonder's box is plain.
  if (row.owner?.colors) {
    const [primary, secondary] = row.owner.colors;

    element.style.setProperty('--owner-primary', primary);
    element.style.setProperty('--owner-secondary', secondary);
  }

  return element;
};

/**
 * The Wonders of the World (F7, #992), as Civ1 lists them: every Wonder built, in the Wonders' own order, each in a box
 *  of its owner's colours. One list that scrolls, rather than Civ1's pages of eight.
 */
export class WondersReport extends Window {
  #transport: Transport;

  constructor(transport: Transport) {
    super(t('WondersReport.title'), s('<div></div>'), {
      classes: 'wonders-report',
    });

    this.#transport = transport;

    this.update();
  }

  /** Draws `rows`: what the engine sent. */
  show(rows: WondersRow[]): void {
    super.update(
      rows.length === 0
        ? s(`<p>${t('WondersReport.empty')}</p>`)
        : s('<div></div>', ...rows.map(buildRow))
    );
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

export default WondersReport;
