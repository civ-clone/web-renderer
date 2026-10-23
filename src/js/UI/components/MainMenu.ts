import { Element, s } from '@dom111/element';
import EarthWindow from './EarthWindow';
import GameSetupWindow from './GameSetupWindow';
import HallOfFameWindow from './HallOfFameWindow';
import ImportAssetsWindow from './ImportAssetsWindow';
import NewGameWindow from './NewGameWindow';
import ReleaseWindow, { fetchReleases } from './ReleaseWindow';
import Transport from '../Transport';
import { assetStore } from '../AssetStore';
import { chooseSaveFile } from '../lib/savedGame';
import { h } from '../lib/html';
import { mappedKeyFromEvent } from '../lib/mappedKey';
import { version } from '../../../../build.json';
import { t } from 'i18next';

export class MainMenu extends Element {
  #transport: Transport;

  constructor(element: HTMLElement, transport: Transport) {
    super(element);

    this.#transport = transport;

    this.build();

    this.addClass('active');
  }

  async build() {
    const hasAssets = await assetStore.hasAllAssets();

    if (!hasAssets) {
      console.log('Missing assets:');
      console.log(await assetStore.missingAssets());
    }

    this.append(
      h(
        s(
          '<nav></nav>',
          // New Game as it has always been, and beside it the game setup (#605), for seats, civilizations and the rest.
          s(
            `<div class="row"></div>`,
            h(
              s(
                `<button autofocus${hasAssets ? '' : ' hidden'}>${t(
                  'MainMenu.new-game'
                )}</button>`
              ),
              {
                click: () => {
                  NewGameWindow.ask(this.#transport, () => this.remove());
                },
              }
            ),
            h(
              s(
                `<button class="secondary"${hasAssets ? '' : ' hidden'}>${t(
                  'MainMenu.customise'
                )}</button>`
              ),
              {
                click: () =>
                  GameSetupWindow.ask(this.#transport, () => this.remove()),
              }
            )
          ),
          h(
            s(
              `<button${hasAssets ? '' : ' hidden'}>${t(
                'MainMenu.earth'
              )}</button>`
            ),
            {
              click: () =>
                new EarthWindow(this.#transport, () => this.remove()),
            }
          ),
          h(
            s(
              `<button${hasAssets ? '' : ' hidden'}>${t(
                'MainMenu.customize-world'
              )}</button>`
            ),
            {
              // The same setup, with the world's exact size and land to hand (#605).
              click: () =>
                GameSetupWindow.ask(this.#transport, () => this.remove(), {
                  advanced: true,
                }),
            }
          ),
          h(
            s(
              `<button${hasAssets ? '' : ' hidden'}>${t(
                'MainMenu.load-game'
              )}</button>`
            ),
            {
              click: () => chooseSaveFile(),
            }
          ),
          h(s(`<button>${t('MainMenu.hall-of-fame')}</button>`), {
            click: () => new HallOfFameWindow(),
          }),
          h(s(`<button>${t('MainMenu.import-assets')}</button>`), {
            click: () => new ImportAssetsWindow(),
          })
        ),
        {
          keydown(event: KeyboardEvent) {
            const currentTarget = document.activeElement,
              key = mappedKeyFromEvent(event);

            if (
              currentTarget === null ||
              !currentTarget.matches('#mainmenu nav button')
            ) {
              return;
            }

            // In the order shown, whichever row a button is in.
            const buttons = Array.from(
                document.querySelectorAll<HTMLElement>(
                  '#mainmenu nav button:not([hidden])'
                )
              ),
              index = buttons.indexOf(currentTarget as HTMLElement),
              step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;

            if (step !== 0 && buttons[index + step]) {
              buttons[index + step].focus();
            }
          },
        }
      ),
      s(
        `<footer></footer>`,
        h(
          s(
            `<a href="#releases">${t('MainMenu.version', {
              version,
            })}</a>`
          ),
          {
            click(event) {
              event.preventDefault();

              new ReleaseWindow(() => fetchReleases(version));
            },
          }
        )
      )
    );
  }

  remove(): void {
    this.queryAll('button').forEach((button) =>
      button.setAttribute('disabled', '')
    );

    this.removeClass('active');

    setTimeout((): void => super.remove(), 2000);
  }
}

export default MainMenu;
