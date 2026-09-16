import { Element, s } from '@dom111/element';
import CityStatus from './CityStatus';
import ConfirmationWindow from './ConfirmationWindow';
import GameOptions from './GameOptions';
import HappinessReport from './HappinessReport';
import { Player } from '../types';
import PopupMenu from './PopupMenu';
import Portal from './Portal';
import ScienceReport from './ScienceReport';
import TradeReport from './TradeReport';
import Transport from '../Transport';
import Window from './Window';
import { chooseSaveFile } from '../lib/savedGame';
import { h } from '../lib/html';
import menuIcon from 'feather-icons/dist/icons/menu.svg';
import { t } from 'i18next';

export class GameMenu extends Element {
  #getPlayer: () => Player;
  #portal: Portal;
  #transport: Transport;
  #debugMode: boolean;

  constructor(
    element: HTMLElement,
    // A getter (rather than a captured `Player`) so reports opened from the
    // menu always read the current player. The menu is built once at game
    // start, so a snapshot here would stay pinned to the turn-0 player (no
    // cities, initial research) for the rest of the session.
    getPlayer: () => Player,
    portal: Portal,
    transport: Transport,
    debugMode: boolean = false
  ) {
    super(element);

    this.#getPlayer = getPlayer;
    this.#portal = portal;
    this.#transport = transport;
    this.#debugMode = debugMode;
  }

  build(): void {
    const button = s(`<button><img src="${menuIcon}"></button>`);

    this.append(
      h(button, {
        click: () => {
          const { offsetLeft: parentX, offsetTop: parentY } = this.element(),
            { offsetLeft: x, offsetTop: y } = button;

          new PopupMenu(
            this,
            parentX + x,
            parentY + y,
            [
              {
                label: t('GameMenu.save-game'),
                action: (menu) => {
                  menu.remove();

                  this.#transport.send('save', {
                    name: t('GameMenu.save-name', {
                      date: new Date(),
                      player: this.#getPlayer().civilization._,
                    }),
                  });
                },
              },
              {
                label: t('GameMenu.load-game'),
                action: (menu) => {
                  menu.remove();

                  new ConfirmationWindow(
                    t('GameMenu.load-game'),
                    t('GameMenu.load-game-confirm'),
                    () => chooseSaveFile()
                  );
                },
              },
              {
                label: t('GameMenu.options'),
                action() {
                  new GameOptions();
                },
              },
              {
                label: t('GameMenu.city-status'),
                action: () => {
                  new CityStatus(
                    this.#getPlayer(),
                    this.#portal,
                    this.#transport
                  );
                },
              },
              {
                label: t('GameMenu.happiness-report'),
                action: () => {
                  new HappinessReport(
                    this.#getPlayer(),
                    this.#portal,
                    this.#transport
                  );
                },
              },
              {
                label: t('GameMenu.trade-report'),
                action: () => {
                  new TradeReport(
                    this.#getPlayer(),
                    this.#portal,
                    this.#transport
                  );
                },
              },
              {
                label: t('GameMenu.science-report'),
                action: () => {
                  new ScienceReport(this.#getPlayer());
                },
              },
              ...(this.#debugMode
                ? [
                    {
                      label: t('GameMenu.cheat.reveal-map'),
                      action: () => {
                        this.#transport.send('cheat', {
                          name: 'RevealMap',
                          value: null,
                        });
                      },
                    },
                    {
                      label: t('GameMenu.cheat.grant-advance'),
                      action: () => {
                        const window = new Window(
                          t('GameMenu.cheat.grant-advance'),
                          s(
                            '<div></div>',
                            s(
                              `<p>${t('GameMenu.cheat.enter-advance-name')}</p>`
                            ),
                            h(
                              s('<input type="text" style="display: block"/>'),
                              {
                                keydown: (event: KeyboardEvent) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    event.stopPropagation();

                                    this.#transport.send('cheat', {
                                      name: 'GrantAdvance',
                                      value: event.target!.value,
                                    });

                                    window.close();
                                  }
                                },
                              }
                            )
                          )
                        );
                      },
                    },
                    {
                      label: t('GameMenu.cheat.grant-gold'),
                      action: () => {
                        const window = new Window(
                          t('GameMenu.cheat.grant-gold'),
                          s(
                            '<div></div>',
                            s(
                              `<p>${t('GameMenu.cheat.enter-gold-amount')}</p>`
                            ),
                            h(s('<input type="text" style="display: block">'), {
                              keydown: (event: KeyboardEvent) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  event.stopPropagation();

                                  this.#transport.send('cheat', {
                                    name: 'GrantGold',
                                    value: parseInt(event.target!.value, 10),
                                  });

                                  window.close();
                                }
                              },
                            })
                          )
                        );
                      },
                    },
                  ]
                : []),
            ],
            {
              align: 'right',
              fullWidth: true,
            }
          );
        },
      })
    );
  }
}

export default GameMenu;
