import Action from './Action';
import ConfirmationWindow from '../ConfirmationWindow';
import { PlayerGovernment } from '../../types';
import Transport from '../../Transport';
import { assetStore } from '../../AssetStore';
import { s } from '@dom111/element';
import { t } from 'i18next';
import currentTileset from '../../lib/tilesets';
import { spriteKey } from '../../tilesets/TilesetDescriptor';

/**
 * Asks before starting a revolution, and sends it once confirmed: for the button and the top bar's government alike
 *  (#698).
 */
export const confirmRevolution = (
  government: PlayerGovernment,
  transport: Transport,
  onConfirm: () => void = () => {}
): ConfirmationWindow =>
  new ConfirmationWindow(
    t('Actions.Revolution.title'),
    t('Actions.Revolution.body'),
    () => {
      transport.send('action', {
        name: 'Revolution',
        id: government.id,
      });

      onConfirm();
    },
    {
      okLabel: 'Actions.Revolution.confirm',
    }
  );

export class Revolution extends Action {
  activate(): void {
    confirmRevolution(this.value(), this.transport(), () => this.complete());
  }

  build(): void {
    assetStore
      .get(spriteKey(currentTileset(), 'city/sad'))
      .then((asset) =>
        this.append(
          s(
            `<button class="revolution small" title="${t(
              'Actions.Revolution.title'
            )}"><img src="${asset!.uri}"></button>`
          )
        )
      );
  }

  value(): PlayerGovernment {
    return super.value() as PlayerGovernment;
  }
}

export default Revolution;
