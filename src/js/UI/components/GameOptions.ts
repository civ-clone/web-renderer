import { AUTOSAVE_CHOICES } from '../lib/browserSaves';
import { COLOUR_SCHEMES, applyColourScheme } from '../lib/theme';
import { IPortal } from './Portal';
import Transport from '../Transport';
import Window from './Window';
import currentTileset from '../lib/tilesets';
import { h } from '../lib/html';
import { instance as options } from '../GameOptionsRegistry';
import { s } from '@dom111/element';
import sendBuildPreferences from '../lib/buildPreferences';
import { t } from 'i18next';

export class GameOptions extends Window {
  // The map's options take effect as they are changed, so the window is given
  // the portal to apply them to, and the build options the transport to send them to the game on (#690, #691).
  constructor(portal: IPortal, transport: Transport | null = null) {
    // A checkbox for a build option the game's rules act on.
    const buildOption = (key: string, label: string): HTMLElement =>
      s(
        `<label>${label}</label>`,
        (() => {
          const input = s<HTMLInputElement>(
            `<input type="checkbox"${
              options.get(key, false) ? ' checked' : ''
            }>`
          );

          return h(input, {
            change: () => {
              options.set(key, input.checked);

              if (transport !== null) {
                sendBuildPreferences(transport);
              }
            },
          });
        })()
      );

    super(
      t('GameOptions.title'),
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
            // The scales the map's tileset can be shown at.
            const { scales } = currentTileset(),
              current = options.get('mapScale', portal.scale()),
              select = s<HTMLSelectElement>(
                `<select>${scales
                  .map(
                    (scale) =>
                      `<option value="${scale}"${
                        scale === current ? ' selected' : ''
                      }>${scale}×</option>`
                  )
                  .join('')}</select>`
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
        ),
        s(
          `<label>${t('GameOptions.autosave')}</label>`,
          (() => {
            // How often the game is kept in the browser (#653).
            const current = options.get('autosave', '5'),
              select = s<HTMLSelectElement>(
                `<select>${AUTOSAVE_CHOICES.map(
                  (choice) =>
                    `<option value="${choice}"${
                      choice === current ? ' selected' : ''
                    }>${t(`GameOptions.autosave-choice.${choice}`)}</option>`
                ).join('')}</select>`
              );

            return h(select, {
              change: () => options.set('autosave', select.value),
            });
          })()
        ),
        s(
          `<label>${t('GameOptions.colour-scheme')}</label>`,
          (() => {
            // The interface's colours (#706), applied as they are chosen.
            const current = options.get('colourScheme', 'system'),
              select = s<HTMLSelectElement>(
                `<select>${COLOUR_SCHEMES.map(
                  (choice) =>
                    `<option value="${choice}"${
                      choice === current ? ' selected' : ''
                    }>${t(
                      `GameOptions.colour-scheme-choice.${choice}`
                    )}</option>`
                ).join('')}</select>`
              );

            return h(select, {
              change: () => {
                options.set('colourScheme', select.value);
                applyColourScheme(select.value);
              },
            });
          })()
        ),
        buildOption(
          'keepBuildingMilitaryUnits',
          t('GameOptions.keep-building-military-units')
        ),
        buildOption(
          'newCitiesBuildDefender',
          t('GameOptions.new-cities-build-defender')
        )
      )
    );

    this.addClass('game-options');
  }
}

export default GameOptions;
