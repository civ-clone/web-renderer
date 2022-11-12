import { e, h, t } from '../lib/html';
import Element from './Element';
import MandatorySelection from './MandatorySelection';
import Transport from '../../../client/Transport';
import Window from './Window';
import Request from '../../../client/Request';
import Options from '../../../client/Requests/Options';

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
      h(
        e(
          'nav',
          h(e('button[autofocus]', t('Start a New Game')), {
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
          h(e('button', t('Customise World')), {
            click: async () => {
              this.disableButtons();

              const existingValues = await transport.request(new Options(), [
                'players',
                'height',
                'width',
                'landCoverage',
                'landSize',
                'maxIterations',
              ]);

              const playersInput = e<HTMLInputElement>(
                  `input[name="players"][type="number"][value="${
                    existingValues.players ?? 7
                  }"][step="1"][min="1"][max="20"]`
                ),
                heightInput = e<HTMLInputElement>(
                  `input[name="height"][type="number"][value="${
                    existingValues.height ?? 60
                  }"][step="1"][min="1"]`
                ),
                widthInput = e<HTMLInputElement>(
                  `input[name="width"][type="number"][value="${
                    existingValues.width ?? 80
                  }"][step="1"][min="1"]`
                ),
                landCoverageInput = e<HTMLInputElement>(
                  `input[name="landCoverage"][type="number"][value="${
                    existingValues.landCoverage ?? 0.4
                  }"][step="0.01"][min="0"]`
                ),
                landSizeInput = e<HTMLInputElement>(
                  `input[name="landSize"][type="number"][value="${
                    existingValues.landSize ?? 0.2
                  }"][step="0.01"][min="0"]`
                ),
                maxIterationsInput = e<HTMLInputElement>(
                  `input[name="maxIterations"][type="number"][value="${
                    existingValues.maxIterations ?? 20
                  }"][step="1"][min="1"]`
                ),
                submit = async () => {
                  window.close();

                  await transport.request(
                    new Request<any[], any>('setOptions'),
                    {
                      players: playersInput.value,
                      height: heightInput.value,
                      width: widthInput.value,
                      landCoverage: landCoverageInput.value,
                      landSize: landSizeInput.value,
                      maxIterations: maxIterationsInput.value,
                    }
                  );

                  this.remove();

                  transport.send('start');
                };

              const window = new Window(
                'Customise world',
                e(
                  'div.customise-world',
                  e('div.option', e('label', t('Players')), playersInput),
                  e('div.option', e('label', t('Height')), heightInput),
                  e('div.option', e('label', t('Width')), widthInput),
                  e(
                    'div.option',
                    e('label', t('Land coverage')),
                    landCoverageInput
                  ),
                  e('div.option', e('label', t('Land size')), landSizeInput),
                  e(
                    'div.option',
                    e('label', t('Max iterations')),
                    maxIterationsInput
                  ),
                  h(e('button', t('Build')), {
                    click: () => submit(),
                  })
                )
              );

              window.element().addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                  submit();
                }
              });
            },
          }),
          h(e('button' + (showQuit ? '' : '[hidden]'), t('Quit')), {
            click: () => {
              this.remove();

              transport.send('quit');
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
