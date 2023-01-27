import { Element, s } from '@dom111/element';
import { GameData, Player } from '../types';
import CityStatus from './CityStatus';
import DataObserver from '../DataObserver';
import HappinessReport from './HappinessReport';
import PopupMenu from './PopupMenu';
import Portal from './Portal';
import ScienceReport from './ScienceReport';
import TradeReport from './TradeReport';
import Transport from '../../Engine/Transport';
import Window from './Window';
import { h } from '../lib/html';
// @ts-ignore
import menuIcon from 'feather-icons/dist/icons/menu.svg';
import GameOptions from './GameOptions';

export class GameMenu extends Element {
  #dataObserver: DataObserver;
  #player: Player;
  #portal: Portal;
  #transport: Transport;

  constructor(
    element: HTMLElement,
    player: Player,
    portal: Portal,
    transport: Transport
  ) {
    super(element);

    this.#player = player;
    this.#portal = portal;
    this.#transport = transport;

    this.#dataObserver = new DataObserver(
      [player.id],
      (data: GameData) => (this.#player = data.player)
    );
  }
  build(): void {
    const button = s(`<button><img src="${menuIcon}"></button>`);

    this.append(
      h(button, {
        click: () => {
          const { offsetLeft: parentX, offsetTop: parentY } = this.element();
          const { offsetLeft: x, offsetTop: y } = button;

          new PopupMenu(
            this,
            parentX + x,
            parentY + y,
            [
              {
                label: 'Options',
                action() {
                  new GameOptions();
                },
              },
              {
                label: 'City Status',
                action: () => {
                  new CityStatus(this.#player, this.#portal, this.#transport);
                },
              },
              {
                label: 'Happiness Report',
                action: () => {
                  new HappinessReport(
                    this.#player,
                    this.#portal,
                    this.#transport
                  );
                },
              },
              {
                label: 'Trade Report',
                action: () => {
                  new TradeReport(this.#player, this.#portal, this.#transport);
                },
              },
              {
                label: 'Science Report',
                action: () => {
                  new ScienceReport(this.#player);
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
