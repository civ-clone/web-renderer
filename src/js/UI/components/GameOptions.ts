import { IPortal } from './Portal';
import Window from './Window';
import { h } from '../lib/html';
import { instance as options } from '../GameOptionsRegistry';
import { s } from '@dom111/element';
import { t } from 'i18next';

export const MAP_SCALES = [1, 2, 3, 4];

export class GameOptions extends Window {
  // The map's options take effect as they are changed, so the window is given
  // the portal to apply them to.
  constructor(portal: IPortal) {
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
        ),
        s(
          `<label>${t('GameOptions.map-scale')}</label>`,
          (() => {
            const current = options.get('mapScale', portal.scale()),
              select = s<HTMLSelectElement>(
                `<select>${MAP_SCALES.map(
                  (scale) =>
                    `<option value="${scale}"${
                      scale === current ? ' selected' : ''
                    }>${scale}×</option>`
                ).join('')}</select>`
              );

            return h(select, {
              change: () => {
                const scale = parseInt(select.value, 10);

                options.set('mapScale', scale);
                portal.setScale(scale);
              },
            });
          })()
        ),
        s(
          `<label>${t('GameOptions.lock-vertical-edges')}</label>`,
          (() => {
            const input = s<HTMLInputElement>(
              `<input type="checkbox"${
                options.get('lockVerticalEdges', portal.lockVerticalEdges())
                  ? ' checked'
                  : ''
              }>`
            );

            return h(input, {
              change: () => {
                options.set('lockVerticalEdges', input.checked);
                portal.setLockVerticalEdges(input.checked);
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
