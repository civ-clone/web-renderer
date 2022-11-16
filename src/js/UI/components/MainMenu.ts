import { e, h, t } from '../lib/html';
import CustomiseWorldWindow from './CustomiseWorldWindow';
import Element from './Element';
import ImportAssetsWindow from './ImportAssetsWindow';
import NewGameWindow from './NewGameWindow';
import Transport from '../../Engine/Transport';
import { assetStore } from '../AssetStore';
import EarthWindow from './EarthWindow';

export class MainMenu extends Element {
  #transport: Transport;

  constructor(element: HTMLElement, transport: Transport) {
    super(element);

    this.#transport = transport;

    this.build();

    element.classList.add('active');
  }

  async build(showQuit = false) {
    const hasAssets = await assetStore.hasAllAssets();

    if (!hasAssets) {
      console.log('Missing assets:');
      console.log(await assetStore.missingAssets());
    }

    this.element().append(
      h(
        e(
          'nav',
          h(
            e(
              'button[autofocus]' + (hasAssets ? '' : '[hidden]'),
              t('Start a New Game')
            ),
            {
              click: () =>
                new NewGameWindow(this.#transport, () => this.remove()),
            }
          ),
          h(e('button', t('Earth')), {
            click: () => new EarthWindow(this.#transport, () => this.remove()),
          }),
          h(e('button' + (hasAssets ? '' : '[hidden]'), t('Customise World')), {
            click: async () =>
              new CustomiseWorldWindow(this.#transport, () => this.remove()),
          }),
          h(e('button', t(hasAssets ? 'Update assets' : 'Import assets')), {
            click: () => new ImportAssetsWindow(),
          }),
          h(e('button' + (showQuit ? '' : '[hidden]'), t('Quit')), {
            click: () => {
              this.remove();

              this.#transport.send('quit');
            },
          })
        ),
        {
          keydown(event: KeyboardEvent) {
            const currentTarget = document.activeElement;

            if (
              currentTarget === null ||
              !currentTarget.matches('#mainmenu nav button')
            ) {
              return;
            }

            if (event.key === 'ArrowDown' && currentTarget.nextElementSibling) {
              (currentTarget.nextElementSibling as HTMLElement).focus();
            }

            if (
              event.key === 'ArrowUp' &&
              currentTarget.previousElementSibling
            ) {
              (currentTarget.previousElementSibling as HTMLElement).focus();
            }
          },
        }
      )
    );
  }

  disableButtons(): void {
    this.element()
      .querySelectorAll('button')
      .forEach((button): void => button.setAttribute('disabled', ''));
  }

  remove(): void {
    this.element().classList.remove('active');

    setTimeout((): void => {
      this.element().remove();
    }, 2000);
  }
}

export default MainMenu;
