import { AUTOSAVE_CHOICES } from '@civ-clone/ui-client/lib/browserSaves';
import {
  COLOUR_SCHEMES,
  applyColourScheme,
  applyUiTheme,
  currentUiTheme,
  uiThemes,
} from '@civ-clone/ui-widgets/lib/theme';
import { IPortal } from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import { UNIT_MARKER_CHOICES } from '@civ-clone/ui-map/components/Map/UnitMarker';
import ImportAssetsWindow from './ImportAssetsWindow';
import Window from '@civ-clone/ui-component-window/Window';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import { button } from '@civ-clone/ui-component-button/button';
import currentTileset from '@civ-clone/ui-assets/lib/tilesets';
import { h } from '@civ-clone/ui-widgets/lib/html';
import {
  hasFeature,
  interfaces,
  InterfaceMode,
  chooseInterface,
  chosenInterface,
  interfaceMode,
} from '@civ-clone/ui-platform/lib/interfaceMode';
import { instance as options } from '@civ-clone/ui-platform/GameOptionsRegistry';
import { s } from '@dom111/element';
import sendBuildPreferences from '@civ-clone/ui-client/lib/buildPreferences';
import { soundChanged } from '@civ-clone/ui-assets/lib/soundGain';
import forgetVisitParam from '@civ-clone/ui-platform/lib/forgetVisitParam';
import { t } from 'i18next';

/** The Assets row: "Civ1 assets imported · 289 sprites" or "Not imported", and Import assets. */
export const assetsRow = (): HTMLElement => {
  const status = s(
      `<span class="status">${t('GameOptions.assets-checking')}</span>`
    ),
    row = s(
      `<div class="assets"></div>`,
      s(`<span>${t('GameOptions.assets')}</span>`),
      status,
      h(button(t('GameOptions.import-assets')), {
        // Over Options, which is modal here: a window that isn't would open behind it.
        click: () => new ImportAssetsWindow({ modal: true }),
      })
    );

  void assetStore
    .importedCount()
    .then(async (count): Promise<void> => {
      status.textContent = (await assetStore.hasAllAssets())
        ? t('GameOptions.assets-imported', {
            count,
            tileset: currentTileset().name,
          })
        : t('GameOptions.assets-missing');
    })
    // The store can't be read: there's nothing to say about it, rather than "Checking…" for good.
    .catch((): void => {
      status.textContent = '';
    });

  return row;
};

/**
 * Sound and Sound volume (#126): Civilization's music, which needs an imported ASOUND.CVL. Without one they're disabled,
 *  with a hint saying what to import. A change is heard at once.
 */
export const soundRows = (): HTMLElement[] => {
  const on = s<HTMLInputElement>(
      `<input type="checkbox" disabled${
        options.get('sound', true) ? ' checked' : ''
      }>`
    ),
    volume = s<HTMLInputElement>(
      `<input type="range" min="0" max="100" step="5" disabled value="${options.get(
        'soundVolume',
        70
      )}">`
    ),
    hint = s<HTMLParagraphElement>(
      `<p class="hint" hidden>${t('GameOptions.sound-unavailable', {
        file: 'ASOUND.CVL',
      })}</p>`
    ),
    // How far along the track the thumb is, 0 to 1, for the theme to fill it to (#739).
    fill = (): void =>
      volume.style.setProperty('--fill', String(Number(volume.value) / 100));

  fill();

  void assetStore
    .hasSoundDriver()
    .catch((): boolean => false)
    .then((available): void => {
      on.disabled = !available;
      volume.disabled = !available;
      hint.hidden = available;
    });

  return [
    s(
      `<label>${t('GameOptions.sound')}</label>`,
      h(on, {
        change: () => {
          options.set('sound', on.checked);
          soundChanged();
        },
      })
    ),
    s(
      `<label>${t('GameOptions.sound-volume')}</label>`,
      h(volume, {
        input: () => {
          fill();
          options.set('soundVolume', Number(volume.value));
          soundChanged();
        },
      })
    ),
    hint,
  ];
};

/**
 * Interface (#735). Everything is put together for one interface as the page loads, so a change needs a new page: it
 *  loads at once from the main menu, and during a game the choice waits for the next load, with a hint saying so, as
 *  reloading would lose the game. Choosing also drops the visit's `?interface=`, which would otherwise outrank it.
 */
export const interfaceRows = (
  inGame: boolean,
  reload: () => void = () => window.location.reload()
): HTMLElement[] => {
  const current = chosenInterface(),
    // A manifest may come from outside, so what it says is never treated as markup.
    select = s<HTMLSelectElement>(
      '<select></select>',
      ...interfaces().map(({ id, name }) => {
        const option = s<HTMLOptionElement>('<option></option>');

        option.value = id;
        option.textContent = t(name);
        option.toggleAttribute('selected', id === current);

        return option;
      })
    ),
    hint = s<HTMLParagraphElement>(
      `<p class="hint"${current === interfaceMode() ? ' hidden' : ''}>${t(
        'GameOptions.interface-next-load'
      )}</p>`
    );

  return [
    s(
      `<label>${t('GameOptions.interface')}</label>`,
      h(select, {
        change: () => {
          const choice = select.value as InterfaceMode;

          options.set('interface', choice);
          chooseInterface(choice);
          forgetVisitParam('interface');

          if (!inGame) {
            reload();

            return;
          }

          hint.hidden = choice === interfaceMode();
        },
      })
    ),
    hint,
  ];
};

/** Theme (#735), applied as it's chosen. Choosing also drops the visit's `?theme=`, which would outrank it next load. */
export const themeRow = (): HTMLElement => {
  const current = currentUiTheme(),
    // The interfaces that bring them register them (#861), so what one says is never treated as markup either.
    select = s<HTMLSelectElement>(
      '<select></select>',
      ...uiThemes().map(({ id, name }) => {
        const option = s<HTMLOptionElement>('<option></option>');

        option.value = id;
        option.textContent = t(name);
        option.toggleAttribute('selected', id === current);

        return option;
      })
    );

  return s(
    `<label>${t('GameOptions.theme')}</label>`,
    h(select, {
      change: () => {
        options.set('uiTheme', select.value);
        applyUiTheme(select.value);
        forgetVisitParam('theme');
      },
    })
  );
};

export class GameOptions extends Window {
  // The map's options take effect as they are changed, so the window is given
  // the portal to apply them to, and the build options the transport to send them to the game on (#690, #691).
  //  From the main menu there's no game yet (#749): the map's options are kept for the next one.
  constructor(portal: IPortal | null, transport: Transport | null = null) {
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
              current = options.get(
                'mapScale',
                portal?.scale() ?? currentTileset().defaultScale
              ),
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
                portal?.setScale(scale);
              },
            });
          })()
        ),
        s(
          `<label>${t('GameOptions.lock-vertical-edges')}</label>`,
          (() => {
            const input = s<HTMLInputElement>(
              `<input type="checkbox"${
                options.get(
                  'lockVerticalEdges',
                  portal?.lockVerticalEdges() ?? false
                )
                  ? ' checked'
                  : ''
              }>`
            );

            return h(input, {
              change: () => {
                options.set('lockVerticalEdges', input.checked);
                portal?.setLockVerticalEdges(input.checked);
              },
            });
          })()
        ),
        s(
          `<label>${t('GameOptions.unit-marker')}</label>`,
          (() => {
            // How the unit awaiting orders is marked (#753), the theme's way unless one is chosen. The map reads it
            //  at its next blink.
            const current = options.get('unitMarker', 'theme'),
              select = s<HTMLSelectElement>(
                `<select>${UNIT_MARKER_CHOICES.map(
                  (choice) =>
                    `<option value="${choice}"${
                      choice === current ? ' selected' : ''
                    }>${t(`GameOptions.unit-marker-choice.${choice}`)}</option>`
                ).join('')}</select>`
              );

            return h(select, {
              change: () => options.set('unitMarker', select.value),
            });
          })()
        ),
        // Only where the interface has the tooltip (#748).
        ...(hasFeature('squareTooltips')
          ? [
              s(
                `<label>${t('GameOptions.square-tooltips')}</label>`,
                (() => {
                  const input = s<HTMLInputElement>(
                    `<input type="checkbox"${
                      options.get('squareTooltips', true) ? ' checked' : ''
                    }>`
                  );

                  return h(input, {
                    change: () => options.set('squareTooltips', input.checked),
                  });
                })()
              ),
            ]
          : []),
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
        ...interfaceRows(portal !== null),
        themeRow(),
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
        ...soundRows(),
        buildOption(
          'keepBuildingMilitaryUnits',
          t('GameOptions.keep-building-military-units')
        ),
        buildOption(
          'newCitiesBuildDefender',
          t('GameOptions.new-cities-build-defender')
        ),
        // Whether the tileset's sprites are imported, and the import, which the new main menu shows only while they
        //  aren't (#749). Only before a game: the import reloads the page, which would lose the game in play.
        ...(hasFeature('assetsInOptions') && portal === null
          ? [assetsRow()]
          : [])
      ),
      // From the main menu it must be closed before a game can start: its Interface and Import assets reload the page,
      //  which they only do with no game to lose.
      { modal: portal === null }
    );

    this.addClass('game-options');
  }
}

export default GameOptions;
