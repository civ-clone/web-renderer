import { e, h, t } from '../lib/html';
import Element from './Element';
import MandatorySelection from './MandatorySelection';
import Transport from '../../../client/Transport';

declare var transport: Transport;

export class MainMenu extends Element {
  constructor(element: HTMLElement) {
    super(element);

    this.build();

    const backgroundImage = document.querySelector(
      '#preload img[src$="main-menu-bg.jpg"]'
    ) as HTMLImageElement;

    if (backgroundImage.loading) {
      backgroundImage.addEventListener('load', () => {
        element.classList.add('active');
      });
    } else {
      element.classList.add('active');
    }
  }

  build(showQuit = false) {
    this.element().append(
      e(
        'nav',
        h(e('button', t('Start a New Game')), {
          click: () => {
            this.disableButtons();

            // TODO: This needs to be done via some `Rule`s or something and ordered via `Priority`, so that other
            //  plugins can add items into the flow
            (
              [
                () => {
                  const numberOfPlayers = new MandatorySelection(
                    'How many players?',
                    [
                      {
                        label: '7 civilizations',
                        value: 7,
                      },
                      {
                        label: '6 civilizations',
                        value: 6,
                      },
                      {
                        label: '5 civilizations',
                        value: 5,
                      },
                      {
                        label: '4 civilizations',
                        value: 4,
                      },
                      {
                        label: '3 civilizations',
                        value: 3,
                      },
                    ],
                    (selection) =>
                      transport.send('setOption', {
                        name: 'players',
                        value: selection,
                      })
                  );

                  return numberOfPlayers.display();
                },
              ] as (() => Promise<any>)[]
            )
              .reduce(
                (promise, menu) => promise.then(() => menu()),
                Promise.resolve()
              )
              .then(() => {
                this.remove();

                transport.send('start');
              });
          },
        }),
        // h(e('button', t('Earth')), {
        //   click: () => {
        //   },
        // }),
        // h(e('button', t('Customise World')), {
        //   click: () => {
        //     // TODO: show options panel
        //   },
        // }),
        h(e('button' + (showQuit ? '' : '[hidden]'), t('Quit')), {
          click: () => {
            this.remove();

            transport.send('quit');
          },
        })
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
