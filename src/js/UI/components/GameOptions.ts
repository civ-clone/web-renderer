import Window from './Window';
import { h } from '../lib/html';
import { instance as options } from '../GameOptionsRegistry';
import { s } from '@dom111/element';
import { t } from 'i18next';

export class GameOptions extends Window {
  constructor() {
    super(
      'Options',
      s(
        `<div></div>`,
        s(
          `<label>${t('GameOptions.auto-end-turn')}</label>`,
          (() => {
            const input = s<HTMLInputElement>(
              `<input type="checkbox"${
                options.get('autoEndOfTurn') ? ' checked' : ''
              }>`
            );

            return h(input, {
              change: () => options.set('autoEndOfTurn', input.checked),
            });
          })()
        )
      )
    );

    this.addClass('game-options');
  }
}

export default GameOptions;
