import { Element, s } from '@dom111/element';
import CheatAdvances from '../../Engine/Requests/CheatAdvances';
import CheatPlayers, {
  CheatPlayersResult,
} from '../../Engine/Requests/CheatPlayers';
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
import { elementId, h } from '../lib/html';
import menuIcon from 'feather-icons/dist/icons/menu.svg';
import { t } from 'i18next';

// Both grant cheats share one form: who receives it, then what they receive.
// The local player comes first, labelled "You" with an empty value so leaving
// the select alone sends no `player` at all; every other player follows,
// including civilizations we haven't met, labelled with their civilization.
// The Grant button or Enter submits. `onPlayerChange` refills `control` for
// the chosen player; the player select is disabled until it has, so a reply
// for an earlier choice can't land after a later one.
const cheatGrantWindow = (
  title: string,
  players: CheatPlayersResult[],
  control: HTMLInputElement | HTMLSelectElement,
  label: string,
  onSubmit: (player: string | null) => void,
  onPlayerChange: (player: string | null) => Promise<void> = async () => {}
): Window => {
  const select = s<HTMLSelectElement>(
      `<select>${[
        `<option value="">${t('GameMenu.cheat.you')}</option>`,
        ...players
          .filter((player) => !player.isLocal)
          .map(
            (player) =>
              `<option value="${player.id}">${t(
                `${player.civilization}.nation`,
                {
                  defaultValue: player.civilization,
                  ns: 'civilization',
                }
              )}</option>`
          ),
      ].join('')}</select>`
    ),
    button = s<HTMLButtonElement>(
      `<button>${t('GameMenu.cheat.grant')}</button>`
    ),
    window = new Window(
      title,
      s(
        '<div class="cheat-grant"></div>',
        ...(
          [
            [select, t('GameMenu.cheat.player')],
            [control, label],
          ] as [HTMLElement, string][]
        ).map(([control, label]) =>
          s(
            `<div class="option"><label for="${elementId(
              control
            )}">${label}</label></div>`,
            control
          )
        ),
        s('<div class="actions"></div>', button)
      )
    ),
    submit = (): void => {
      onSubmit(select.value || null);

      window.close();
    };

  h(select, {
    change: async () => {
      select.disabled = true;

      try {
        await onPlayerChange(select.value || null);
      } finally {
        select.disabled = false;
      }
    },
  });

  h(button, {
    click: () => submit(),
  });

  h(control, {
    keydown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      submit();
    },
  });

  control.focus();

  return window;
};

export class GameMenu extends Element {
  #getPlayer: () => Player;
  #getTurn: () => number;
  #portal: Portal;
  #transport: Transport;
  #cheatsEnabled: boolean;

  constructor(
    element: HTMLElement,
    // A getter (rather than a captured `Player`) so reports opened from the
    // menu always read the current player. The menu is built once at game
    // start, so a snapshot here would stay pinned to the turn-0 player (no
    // cities, initial research) for the rest of the session.
    getPlayer: () => Player,
    getTurn: () => number,
    portal: Portal,
    transport: Transport,
    cheatsEnabled: boolean = false
  ) {
    super(element);

    this.#getPlayer = getPlayer;
    this.#getTurn = getTurn;
    this.#portal = portal;
    this.#transport = transport;
    this.#cheatsEnabled = cheatsEnabled;
  }

  // For the rest of this session: the menu is rebuilt each time it opens, so
  // the cheat items show from the next open. Nothing is saved.
  enableCheats(): void {
    this.#cheatsEnabled = true;
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
                      // Plain parts: i18next escapes interpolated values for
                      // HTML, so a localised date came through as
                      // `16&#x2F;09&#x2F;2026` and left `16x2F09x2F2026` in the
                      // file name once the punctuation was stripped.
                      date: new Date().toISOString().slice(0, 10),
                      player: this.#getPlayer().civilization._,
                      turn: this.#getTurn(),
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
                action: () => {
                  new GameOptions(this.#portal);
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
              ...(this.#cheatsEnabled
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
                      action: async () => {
                        const advances = s<HTMLSelectElement>(
                            '<select multiple size="10"></select>'
                          ),
                          showAdvances = async (
                            player: string | null
                          ): Promise<void> => {
                            const available = await this.#transport.request(
                              new CheatAdvances(player)
                            );

                            advances.innerHTML =
                              available.length === 0
                                ? `<option disabled>${t(
                                    'GameMenu.cheat.no-advances'
                                  )}</option>`
                                : available
                                    .map((advance): [string, string] => [
                                      advance,
                                      t(`${advance}.name`, {
                                        defaultValue: advance,
                                        ns: 'science',
                                      }),
                                    ])
                                    .sort(([, a], [, b]) => a.localeCompare(b))
                                    .map(
                                      ([advance, name]) =>
                                        `<option value="${advance}">${name}</option>`
                                    )
                                    .join('');
                          };

                        await showAdvances(null);

                        cheatGrantWindow(
                          t('GameMenu.cheat.grant-advance'),
                          await this.#transport.request(new CheatPlayers()),
                          advances,
                          t('GameMenu.cheat.choose-advances'),
                          (player) => {
                            const chosen = [...advances.selectedOptions].map(
                              (option) => option.value
                            );

                            if (chosen.length === 0) {
                              return;
                            }

                            this.#transport.send('cheat', {
                              name: 'GrantAdvance',
                              value: {
                                advances: chosen,
                                ...(player ? { player } : {}),
                              },
                            });
                          },
                          showAdvances
                        );
                      },
                    },
                    {
                      label: t('GameMenu.cheat.grant-gold'),
                      action: async () => {
                        const amount = s<HTMLInputElement>(
                          '<input type="number" step="1">'
                        );

                        cheatGrantWindow(
                          t('GameMenu.cheat.grant-gold'),
                          await this.#transport.request(new CheatPlayers()),
                          amount,
                          t('GameMenu.cheat.enter-gold-amount'),
                          (player) => {
                            const value = parseInt(amount.value, 10);

                            if (Number.isNaN(value)) {
                              return;
                            }

                            this.#transport.send('cheat', {
                              name: 'GrantGold',
                              value: {
                                amount: value,
                                ...(player ? { player } : {}),
                              },
                            });
                          }
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
