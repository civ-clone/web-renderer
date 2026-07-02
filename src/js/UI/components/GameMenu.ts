import { Element, s } from '@dom111/element';
import CityStatus from './CityStatus';
import GameOptions from './GameOptions';
import HappinessReport from './HappinessReport';
import { Player } from '../types';
import PopupMenu from './PopupMenu';
import Portal from './Portal';
import ScienceReport from './ScienceReport';
import TradeReport from './TradeReport';
import Transport from '../Transport';
import { h } from '../lib/html';
import menuIcon from 'feather-icons/dist/icons/menu.svg';
import { t } from 'i18next';

export class GameMenu extends Element {
  #getPlayer: () => Player;
  #portal: Portal;
  #transport: Transport;

  constructor(
    element: HTMLElement,
    // A getter (rather than a captured `Player`) so reports opened from the
    // menu always read the current player. The menu is built once at game
    // start, so a snapshot here would stay pinned to the turn-0 player (no
    // cities, initial research) for the rest of the session.
    getPlayer: () => Player,
    portal: Portal,
    transport: Transport
  ) {
    super(element);

    this.#getPlayer = getPlayer;
    this.#portal = portal;
    this.#transport = transport;
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
