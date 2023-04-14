import { Element, s } from '@dom111/element';
import CustomiseWorldWindow from './CustomiseWorldWindow';
import EarthWindow from './EarthWindow';
import ImportAssetsWindow from './ImportAssetsWindow';
import NewGameWindow from './NewGameWindow';
import ReleaseWindow from './ReleaseWindow';
import Transport from '../Transport';
import { assetStore } from '../AssetStore';
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

  async build(showQuit = false) {
    const hasAssets = await assetStore.hasAllAssets();

    if (!hasAssets) {
      console.log('Missing assets:');
      console.log(await assetStore.missingAssets());
    }

    this.append(
      h(
        s(
          '<nav></nav>',
          h(
            s(
              `<button autofocus${hasAssets ? '' : ' hidden'}>${t(
                'MainMenu.new-game'
              )}</button>`
            ),
            {
              click: () => {
                new NewGameWindow(this.#transport, () => this.remove());
              },
            }
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
              click: async () =>
                new CustomiseWorldWindow(this.#transport, () => this.remove()),
            }
          ),
          h(s(`<button>Import Assets</button>`), {
            click: () => new ImportAssetsWindow(),
          }),
          h(
            s(
              `<button${showQuit ? '' : ' hidden'}>${t(
                'MainMenu.quit'
              )}</button>`
            ),
            {
              click: () => {
                this.remove();

                this.#transport.send('quit', null);
              },
            }
          )
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

            if (key === 'ArrowDown' && currentTarget.nextElementSibling) {
              (currentTarget.nextElementSibling as HTMLElement).focus();
            }

            if (key === 'ArrowUp' && currentTarget.previousElementSibling) {
              (currentTarget.previousElementSibling as HTMLElement).focus();
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

              new ReleaseWindow();
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
