import { Element, s } from '@dom111/element';
import CheatAdvances from '../../Engine/Requests/CheatAdvances';
import CheatUnitTypes from '../../Engine/Requests/CheatUnitTypes';
import CheatPlayers, {
  CheatPlayersResult,
} from '../../Engine/Requests/CheatPlayers';
import CityStatus from './CityStatus';
import Civilopedia from './Civilopedia';
import CivilizationScoreReport from './CivilizationScoreReport';
import ConfirmationWindow from './ConfirmationWindow';
import GameOptions from './GameOptions';
import HappinessReport from './HappinessReport';
import IntelligenceReport from './IntelligenceReport';
import MilitaryReport from './MilitaryReport';
import { Player } from '../types';
import PopupMenu from './PopupMenu';
import Portal from './Portal';
import ScienceReport from './ScienceReport';
import TopCitiesReport from './TopCitiesReport';
import TradeReport from './TradeReport';
import Transport from '../Transport';
import Window from './Window';
import { allowLeaving } from '../lib/leaveGuard';
import { chooseSave } from './LoadGameWindow';
import { elementId, h } from '../lib/html';
import menuIcon from 'feather-icons/dist/icons/menu.svg';
import { t } from 'i18next';
import { unlessRequestFailed } from '../lib/unlessRequestFailed';

// The local player comes first, labelled "You" with an empty value so leaving
// the select alone sends no `player` at all; every other player follows,
// including civilizations we haven't met, labelled with their civilization, capitalised as a label ("The Aztec
// Empire", #359).
const cheatPlayerSelect = (players: CheatPlayersResult[]): HTMLSelectElement =>
  s<HTMLSelectElement>(
    `<select>${[
      `<option value="">${t('GameMenu.cheat.you')}</option>`,
      ...players
        .filter((player) => !player.isLocal)
        .map(
          (player) =>
            `<option value="${player.id}">${t(
              'Generic.civilization-name.nation-start',
              { civilization: player.civilization }
            )}</option>`
        ),
    ].join('')}</select>`
  );

// A menu item that asks the worker before it opens its window: one that isn't answered opens nothing, the player
//  having been told (#580).
const whenAnswered =
  (action: () => Promise<void>): (() => void) =>
  (): void =>
    void action().catch(unlessRequestFailed);

// Both grant cheats share one form: who receives it, then what they receive.
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
  const select = cheatPlayerSelect(players),
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

  // The player `control` was last filled for.
  let filledFor = select.value;

  h(select, {
    change: async () => {
      select.disabled = true;

      try {
        await onPlayerChange(select.value || null);

        filledFor = select.value;
      } catch (error) {
        // Not answered: the player has been told, and `control` still holds the last player's, so that player is
        //  chosen again, rather than granting them to this one (#580).
        select.value = filledFor;

        unlessRequestFailed(error);
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

// Unlike the grant forms this stays open after Create, so several units can be
// placed. While it is open, clicking the map fills in the clicked tile's
// coordinates; the click still does whatever it normally does.
const cheatCreateUnitWindow = (
  players: CheatPlayersResult[],
  unitTypes: string[],
  portal: Portal,
  start: { x: number; y: number },
  onSubmit: (value: {
    player: string | null;
    unitType: string;
    x: number;
    y: number;
  }) => void
): Window => {
  const select = cheatPlayerSelect(players),
    unitType = s<HTMLSelectElement>(
      `<select>${unitTypes
        .map((unitType): [string, string] => [
          unitType,
          t(`${unitType}.name`, {
            defaultValue: unitType,
            ns: 'unit',
          }),
        ])
        .sort(([, a], [, b]) => a.localeCompare(b))
        .map(
          ([unitType, name]) => `<option value="${unitType}">${name}</option>`
        )
        .join('')}</select>`
    ),
    x = s<HTMLInputElement>(
      `<input type="number" step="1" min="0" value="${start.x}">`
    ),
    y = s<HTMLInputElement>(
      `<input type="number" step="1" min="0" value="${start.y}">`
    ),
    button = s<HTMLButtonElement>(
      `<button>${t('GameMenu.cheat.create')}</button>`
    ),
    window = new Window(
      t('GameMenu.cheat.create-unit'),
      s(
        '<div class="cheat-grant"></div>',
        ...(
          [
            [select, t('GameMenu.cheat.player')],
            [unitType, t('GameMenu.cheat.unit-type')],
            [x, t('GameMenu.cheat.x')],
            [y, t('GameMenu.cheat.y')],
          ] as [HTMLElement, string][]
        ).map(([control, label]) =>
          s(
            `<div class="option"><label for="${elementId(
              control
            )}">${label}</label></div>`,
            control
          )
        ),
        s(`<p class="hint">${t('GameMenu.cheat.click-map')}</p>`),
        s('<div class="actions"></div>', button)
      )
    ),
    fill = (tileX: number, tileY: number): void => {
      x.value = String(tileX);
      y.value = String(tileY);
    },
    submit = (): void => {
      const tileX = x.valueAsNumber,
        tileY = y.valueAsNumber;

      // A fractional or negative coordinate is refused, not rounded onto another square.
      if (
        !unitType.value ||
        !Number.isInteger(tileX) ||
        !Number.isInteger(tileY) ||
        tileX < 0 ||
        tileY < 0
      ) {
        return;
      }

      onSubmit({
        player: select.value || null,
        unitType: unitType.value,
        x: tileX,
        y: tileY,
      });
    };

  portal.on('tile-clicked', fill);
  window.on('close', () => portal.off('tile-clicked', fill));

  h(button, {
    click: () => submit(),
  });

  [x, y].forEach((control) =>
    h(control, {
      keydown: (event: KeyboardEvent) => {
        if (event.key !== 'Enter') {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        submit();
      },
    })
  );

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

  // The name a save is given, and downloaded under.
  #saveName(): string {
    return t('GameMenu.save-name', {
      // Plain parts: i18next escapes interpolated values for HTML, so a
      // localised date came through as `16&#x2F;09&#x2F;2026` and left
      // `16x2F09x2F2026` in the file name once the punctuation was stripped.
      date: new Date().toISOString().slice(0, 10),
      player: this.#getPlayer().civilization._,
      turn: this.#getTurn(),
    });
  }

  // Save Game, from the menu or Shift+S.
  saveGame(): void {
    this.#transport.send('save', { name: this.#saveName() });
  }

  // As a turn starts (#653): a new game's first, or every few turns after.
  autosave(kind: 'start' | 'autosave'): void {
    this.#transport.send('save', { name: this.#saveName(), autosave: kind });
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

                  this.saveGame();
                },
              },
              {
                label: t('GameMenu.load-game'),
                action: (menu) => {
                  menu.remove();

                  new ConfirmationWindow(
                    t('GameMenu.load-game'),
                    t('GameMenu.load-game-confirm'),
                    // An autosave (#653) or a file, its seats shown first, to reassign (#608).
                    () => void chooseSave(this.#transport)
                  );
                },
              },
              {
                label: t('GameMenu.options'),
                action: () => {
                  new GameOptions(this.#portal);
                },
              },
              // Retire ends the game with your score (#176); Quit leaves it for the main menu, reloading for a fresh
              //  worker as loading a save does (#362).
              {
                label: t('GameMenu.retire'),
                action: (menu) => {
                  menu.remove();

                  new ConfirmationWindow(
                    t('GameMenu.retire'),
                    t('GameMenu.retire-confirm'),
                    () => this.#transport.send('retire', null)
                  );
                },
              },
              {
                label: t('GameMenu.quit'),
                action: (menu) => {
                  menu.remove();

                  new ConfirmationWindow(
                    t('GameMenu.quit'),
                    t('GameMenu.quit-confirm'),
                    () => {
                      allowLeaving();

                      window.location.reload();
                    }
                  );
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
                label: t('GameMenu.military-report'),
                action: () => {
                  new MilitaryReport(this.#transport);
                },
              },
              {
                label: t('GameMenu.intelligence-report'),
                action: () => {
                  new IntelligenceReport(this.#transport);
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
              {
                label: t('GameMenu.top-cities'),
                action: () => {
                  new TopCitiesReport(this.#transport);
                },
              },
              {
                label: t('GameMenu.civilization-score'),
                action: () => {
                  new CivilizationScoreReport(this.#transport);
                },
              },
              {
                label: t('GameMenu.civilopedia'),
                action: () => {
                  Civilopedia.open(this.#transport);
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
                      action: whenAnswered(async () => {
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
                      }),
                    },
                    {
                      label: t('GameMenu.cheat.create-unit'),
                      action: whenAnswered(async () => {
                        const [players, unitTypes] = await Promise.all([
                          this.#transport.request(new CheatPlayers()),
                          this.#transport.request(new CheatUnitTypes()),
                        ]);

                        cheatCreateUnitWindow(
                          players,
                          unitTypes,
                          this.#portal,
                          this.#portal.center(),
                          ({ player, unitType, x, y }) =>
                            this.#transport.send('cheat', {
                              name: 'CreateUnit',
                              value: {
                                unitType,
                                x,
                                y,
                                ...(player ? { player } : {}),
                              },
                            })
                        );
                      }),
                    },
                    {
                      label: t('GameMenu.cheat.grant-gold'),
                      action: whenAnswered(async () => {
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
                      }),
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
