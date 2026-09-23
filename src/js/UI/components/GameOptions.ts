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
        ),
        s(
          `<label>${t('GameOptions.unit-edge-margin')}</label>`,
          (() => {
            const input = s<HTMLInputElement>(
              `<input type="number" min="0" max="10" step="1" value="${options.get(
                'unitEdgeMargin',
                0
              )}">`
            );

            return h(input, {
              change: () => {
                const value = parseInt(input.value, 10);

                options.set(
                  'unitEdgeMargin',
                  Number.isNaN(value) ? 0 : Math.min(10, Math.max(0, value))
                );
              },
            });
          })()
        )
      )
    );

    this.addClass('game-options');
  }
}

export default GameOptions;
