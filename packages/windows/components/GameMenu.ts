import { Element, s } from '@dom111/element';
import CheatAdvances from '@civ-clone/ui-protocol/Requests/CheatAdvances';
import CheatUnitTypes from '@civ-clone/ui-protocol/Requests/CheatUnitTypes';
import CheatPlayers, {
  CheatPlayersResult,
} from '@civ-clone/ui-protocol/Requests/CheatPlayers';
import {
  openCityStatus,
  openCivilizationScore,
  openHappinessReport,
  openIntelligenceReport,
  openMilitaryReport,
  openTopCities,
  openTradeReport,
} from './reports';
import Civilopedia from './Civilopedia';
import ConfirmationWindow from '@civ-clone/ui-component-window/ConfirmationWindow';
import GameOptions from './GameOptions';
import { Player } from '@civ-clone/ui-protocol/types';
import PopupMenu, {
  hasPopupMenu,
} from '@civ-clone/ui-component-popup-menu/PopupMenu';
import UiMenu, { UiMenuItem } from './UiMenu';
import { hasFeature } from '@civ-clone/ui-client/lib/interfaceMode';
import { windowKey } from '@civ-clone/ui-component-window/windowEyebrows';
import Portal from '@civ-clone/ui-map/components/Portal';
import ScienceReport from './ScienceReport';
import Transport from '@civ-clone/ui-client/Transport';
import Window from '@civ-clone/ui-component-window/Window';
import { allowLeaving } from '../lib/leaveGuard';
import { chooseSave } from './LoadGameWindow';
import { elementId, h } from '@civ-clone/ui-widgets/lib/html';
import { SaveDetails } from '@civ-clone/ui-protocol/Transport';
import { t } from 'i18next';
import { glyph } from '@civ-clone/ui-assets/lib/glyphs';
import { unlessRequestFailed } from '@civ-clone/ui-client/lib/unlessRequestFailed';

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
      `<button class="btn-secondary">${t('GameMenu.cheat.grant')}</button>`
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
      `<button class="btn-secondary">${t('GameMenu.cheat.create')}</button>`
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
  #findCity: () => void;
  #getPlayer: () => Player;
  #getTurn: () => number;
  #getYear: () => number;
  #portal: Portal;
  #transport: Transport;
  #cheatsEnabled: boolean;
  #menu: UiMenu | null = null;

  constructor(
    element: HTMLElement,
    // A getter (rather than a captured `Player`) so reports opened from the
    // menu always read the current player. The menu is built once at game
    // start, so a snapshot here would stay pinned to the turn-0 player (no
    // cities, initial research) for the rest of the session.
    getPlayer: () => Player,
    getTurn: () => number,
    getYear: () => number,
    portal: Portal,
    transport: Transport,
    cheatsEnabled: boolean = false,
    findCity: () => void = (): void => {}
  ) {
    super(element);

    this.#findCity = findCity;
    this.#getPlayer = getPlayer;
    this.#getTurn = getTurn;
    this.#getYear = getYear;
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

  // What the save is of, for the main menu's Continue to show (#749).
  #saveDetails(): SaveDetails {
    return {
      civilization: this.#getPlayer().civilization._,
      turn: this.#getTurn(),
      year: this.#getYear(),
    };
  }

  // Find City, from the menu or `/` (#346).
  findCity(): void {
    this.#findCity();
  }

  // Save Game, from the menu or Shift+S.
  saveGame(): void {
    this.#transport.send('save', {
      name: this.#saveName(),
      details: this.#saveDetails(),
    });
  }

  // As a turn starts (#653): a new game's first, or every few turns after.
  autosave(kind: 'start' | 'autosave'): void {
    this.#transport.send('save', {
      name: this.#saveName(),
      autosave: kind,
      details: this.#saveDetails(),
    });
  }

  // What the menu offers (#808), worked out as it opens, as the cheats can be turned on mid-game: the classic menu lists
  //  them in its old order, and the new one in sections, with the rows that end the game last.
  #rows(): {
    game: UiMenuItem[];
    reports: UiMenuItem[];
    reference: UiMenuItem[];
    cheats: UiMenuItem[];
    end: UiMenuItem[];
  } {
    const game: UiMenuItem[] = [
        {
          label: t('GameMenu.save-game'),
          key: 'Shift+S',
          action: () => {
            this.saveGame();
          },
        },
        {
          label: t('GameMenu.load-game'),
          action: () => {
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
            new GameOptions(this.#portal, this.#transport);
          },
        },
      ],
      // Retire ends the game with your score (#176); Quit leaves it for the main menu, reloading for a fresh worker as
      //  loading a save does (#362).
      end: UiMenuItem[] = [
        {
          label: t('GameMenu.retire'),
          danger: true,
          action: () => {
            new ConfirmationWindow(
              t('GameMenu.retire'),
              t('GameMenu.retire-confirm'),
              () => this.#transport.send('retire', null)
            );
          },
        },
        {
          label: t('GameMenu.quit'),
          danger: true,
          action: () => {
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
      ],
      reports: UiMenuItem[] = [
        {
          label: t('GameMenu.city-status'),
          key: windowKey('city-status'),
          action: () => {
            openCityStatus(this.#getPlayer(), this.#portal, this.#transport);
          },
        },
        {
          label: t('GameMenu.military-report'),
          key: windowKey('military-report'),
          action: () => {
            openMilitaryReport(this.#transport);
          },
        },
        {
          label: t('GameMenu.intelligence-report'),
          key: windowKey('intelligence-report'),
          action: () => {
            openIntelligenceReport(this.#transport);
          },
        },
        {
          label: t('GameMenu.happiness-report'),
          key: windowKey('happiness-report'),
          action: () => {
            openHappinessReport(
              this.#getPlayer(),
              this.#portal,
              this.#transport
            );
          },
        },
        {
          label: t('GameMenu.trade-report'),
          key: windowKey('trade-report'),
          action: () => {
            openTradeReport(this.#getPlayer(), this.#portal, this.#transport);
          },
        },
        {
          label: t('GameMenu.science-report'),
          key: windowKey('science-report'),
          action: () => {
            new ScienceReport(this.#getPlayer());
          },
        },
        {
          label: t('GameMenu.top-cities'),
          key: windowKey('top-cities-report'),
          action: () => {
            openTopCities(this.#getPlayer(), this.#portal, this.#transport);
          },
        },
        {
          label: t('GameMenu.civilization-score'),
          key: windowKey('civilization-score-report'),
          action: () => {
            openCivilizationScore(this.#transport);
          },
        },
      ],
      reference: UiMenuItem[] = [
        {
          label: t('GameMenu.find-city'),
          key: windowKey('find-city'),
          action: () => {
            this.findCity();
          },
        },
        {
          label: t('GameMenu.civilopedia'),
          key: '?',
          action: () => {
            Civilopedia.open(this.#transport);
          },
        },
      ],
      cheats: UiMenuItem[] = this.#cheatsEnabled
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
                    const available: string[] = await this.#transport.request(
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
        : [];

    return { game, reports, reference, cheats, end };
  }

  build(): void {
    const button = s<HTMLButtonElement>(
      `<button class="btn-bare" aria-label="${t('GameMenu.label')}">${glyph(
        'menu'
      )}</button>`
    );
    // Whether the classic menu was open as the button was pressed: that press closes it, as any press does, and its
    //  click mustn't open it again (#710).
    let openAtPress = false;

    button.setAttribute('aria-haspopup', 'menu');

    if (hasFeature('sharedMenus')) {
      button.setAttribute('aria-expanded', 'false');
    }

    this.append(
      h(button, {
        pointerdown: () => {
          openAtPress = hasPopupMenu(this);
        },
        click: (event: MouseEvent) => {
          if (hasFeature('sharedMenus')) {
            // From the keyboard, a click with no pointer behind it.
            this.#toggle(button, event.detail === 0);

            return;
          }

          const closedByThisPress = openAtPress && event.detail !== 0;

          openAtPress = false;

          if (closedByThisPress) {
            return;
          }

          // Where the button is on the page: the menu is appended to the body, and the button is in the top bar's
          //  flow, not placed by the game menu itself (#697).
          const { left, top } = button.getBoundingClientRect(),
            { game, reports, reference, cheats, end } = this.#rows();

          new PopupMenu(
            this,
            left + window.scrollX,
            top + window.scrollY,
            [...game, ...end, ...reports, ...reference, ...cheats].map(
              ({ label, action }) => ({ label, action: () => action() })
            ),
            {
              align: 'right',
              // From the keyboard, a click with no pointer behind it: the first item takes the focus (#853).
              byKeyboard: event.detail === 0,
              fullWidth: true,
              label: t('GameMenu.label'),
              restoreFocus: button,
            }
          );
        },
      })
    );
  }

  // The new interface's menu (#808) under the button, or closed when it's open: the button toggles it.
  #toggle(button: HTMLButtonElement, byKeyboard: boolean): void {
    if (this.#menu?.isOpen()) {
      this.#menu.close({ restoreFocus: byKeyboard });

      return;
    }

    const { game, reports, reference, cheats, end } = this.#rows();

    this.#menu = new UiMenu({
      label: t('GameMenu.label'),
      launcher: button,
      byKeyboard,
      anchor: { below: button.getBoundingClientRect() },
      className: 'ui-game-menu',
      sections: [
        { items: game },
        { heading: t('GameMenu.section.reports'), items: reports },
        { heading: t('GameMenu.section.reference'), items: reference },
        { heading: t('GameMenu.section.cheats'), items: cheats },
        { rule: true, items: end },
      ],
    });
  }
}

export default GameMenu;
