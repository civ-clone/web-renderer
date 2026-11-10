import { Element, s } from '@dom111/element';
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
import { GameMenuItem, GameMenuRows, mapMenus } from './mapMenus';
import { windowKey } from '@civ-clone/ui-component-window/windowEyebrows';
import Portal from '@civ-clone/ui-map/components/Portal';
import ScienceReport from './ScienceReport';
import Transport from '@civ-clone/ui-client/Transport';
import { allowLeaving } from '../lib/leaveGuard';
import { chooseSave } from './LoadGameWindow';
import { SaveDetails } from '@civ-clone/ui-protocol/Transport';
import { t } from 'i18next';
import { glyph } from '@civ-clone/ui-assets/lib/glyphs';

export class GameMenu extends Element {
  #findCity: () => void;
  #getPlayer: () => Player;
  #getTurn: () => number;
  #getYear: () => number;
  #portal: Portal;
  #transport: Transport;
  #cheatsEnabled: boolean;
  #cheats: () => GameMenuItem[];

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
    findCity: () => void = (): void => {},
    // The cheat items, while `cheatsEnabled`: the game's debug code brings them, worked out each time the menu opens.
    cheats: () => GameMenuItem[] = (): GameMenuItem[] => []
  ) {
    super(element);

    this.#findCity = findCity;
    this.#getPlayer = getPlayer;
    this.#getTurn = getTurn;
    this.#getYear = getYear;
    this.#portal = portal;
    this.#transport = transport;
    this.#cheatsEnabled = cheatsEnabled;
    this.#cheats = cheats;
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

  // What the menu offers (#808), worked out as it opens, as the cheats can be turned on mid-game: the interface's menu
  //  lays the sections out (#860).
  #rows(): GameMenuRows {
    const game: GameMenuItem[] = [
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
      end: GameMenuItem[] = [
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
      reports: GameMenuItem[] = [
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
      reference: GameMenuItem[] = [
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
      cheats: GameMenuItem[] = this.#cheatsEnabled ? this.#cheats() : [];

    return { game, reports, reference, cheats, end };
  }

  build(): void {
    const button = s<HTMLButtonElement>(
      `<button class="btn-bare" aria-label="${t('GameMenu.label')}">${glyph(
        'menu'
      )}</button>`
    );

    button.setAttribute('aria-haspopup', 'menu');

    // The interface's menu (#860): its own, under the button, or a popup.
    mapMenus.current().gameMenuButton(button, this, () => this.#rows());

    this.append(button);
  }
}

export default GameMenu;
