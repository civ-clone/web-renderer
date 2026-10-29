import { NotificationWindow } from './NotificationWindow';
import { escape } from './lib/requirements';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

// Civ1's limit (`F23_0000_0000_CityNameDialog`). The worker holds to it too: this only stops a longer name being typed.
export const cityNameMaxLength = 12;

/**
 * The "City name" box the city screen's Rename opens (#676), filled with the city's name. `onOK` has the name typed,
 * trimmed, and isn't called for an empty one, which leaves the name as it was, as Cancel does.
 */
export class CityNameWindow extends NotificationWindow {
  constructor(name: string, onOK: (name: string) => void) {
    const input = s<HTMLInputElement>(
        `<input type="text" name="name" maxlength="${cityNameMaxLength}" value="${escape(
          name
        )}" aria-label="${t('City.Rename.label')}">`
      ),
      ok = () => {
        const name = input.value.trim();

        this.close();

        if (name !== '') {
          onOK(name);
        }
      };

    super(
      t('City.Rename.title'),
      s(
        `<div class="content"></div>`,
        s(`<label><p>${t('City.Rename.label')}</p></label>`, input),
        s(
          '<footer></footer>',
          h(s(`<button>${t('Generic.ok')}</button>`), { click: ok }),
          h(s(`<button>${t('Generic.cancel')}</button>`), {
            click: () => this.close(),
          })
        )
      ),
      {
        classes: ['confirmationWindow', 'city-name-window'],
      }
    );

    // Enter in the field is OK, not the window's own Enter, which only closes it.
    h(input, {
      keydown: (event: KeyboardEvent) => {
        if (event.key !== 'Enter') {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        ok();
      },
    });

    input.focus();
    input.select();
  }
}

export default CityNameWindow;
