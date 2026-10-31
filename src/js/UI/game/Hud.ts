import { GameData, Tile, Unit } from '../types';
import Actions from '../components/Actions';
import GameDetails from '../components/GameDetails';
import NextTurn from '../components/NextTurn';
import Notices from '../components/Notices';
import PlayerDetails from '../components/PlayerDetails';
import Portal from '../components/Portal';
import ScienceReport from '../components/ScienceReport';
import PowerList from '../components/PowerList';
import TradeReport from '../components/TradeReport';
import Transport from '../Transport';
import UnitActions from '../components/UnitActions';
import { interfaceMode } from '../lib/interfaceMode';
import nextTurnQueue from '../lib/nextTurnQueue';
import partitionActions from '../lib/playerActionPanels';
import { t } from 'i18next';

// The panels around the map: the player's actions (the end-turn area and the secondary panel), the active unit's
//  action buttons, and the game and player details. Rebuilt from the latest data on every render. The sidebar's Power
//  list is told the turn, and asks for itself on a new one (#701, #708).
//
// Reaches beyond its own panels in one place: `build` appends the primary panel to `gameArea` every time, which moves
//  it to the end of the game area.

export type HudDeps = {
  actionArea: HTMLElement;
  // The Next Turn button's units item (#702): the map centred on the active unit.
  centreActiveUnit?: () => void;
  gameArea: HTMLElement;
  gameInfo: HTMLElement;
  // Page-scoped, and cleared by the `document` `endturn` event: its notices are added to the primary panel each time.
  notices: Pick<Notices, 'actions'>;
  playerInfo: HTMLElement;
  portal: Portal;
  // The sidebar's Power list (#701, #708), when the page has it.
  power?: Pick<PowerList, 'turn'> | null;
  secondaryActionArea: HTMLElement;
  transport: Transport;
  // A unit's action button clicked: the active unit's controller sends it, as its key would (#543).
  unitAction: (unitId: string, unitAction: string) => void;
  unitActionArea: HTMLElement;
  // For the active unit's tile, as the world holds it.
  world: { get(x: number, y: number): Tile };
};

export class Hud {
  #deps: HudDeps;
  // Under the new interface (#735), the Next Turn button (#702) takes the primary panel's place.
  #nextTurn: NextTurn | null = null;
  #primaryActions: Actions | null = null;
  #secondaryActions: Actions;
  #unitActionButtons: UnitActions;

  constructor(deps: HudDeps) {
    this.#deps = deps;

    const {
      actionArea,
      portal,
      secondaryActionArea,
      transport,
      unitAction,
      unitActionArea,
    } = deps;

    if (interfaceMode() === 'new') {
      this.#nextTurn = new NextTurn(actionArea, {
        centreActiveUnit: deps.centreActiveUnit ?? (() => {}),
        portal,
        transport,
      });
    } else {
      this.#primaryActions = new Actions(actionArea, portal, transport);
    }
    this.#secondaryActions = new Actions(
      secondaryActionArea,
      portal,
      transport
    );
    this.#unitActionButtons = new UnitActions(unitActionArea, unitAction);
  }

  /** The Next Turn button, under the new interface: Enter and Shift+Enter press and skip it (`InputController`). */
  nextTurn(): NextTurn | null {
    return this.#nextTurn;
  }

  build(data: GameData, activeUnit: Unit | null, waiting: boolean): void {
    const {
      gameArea,
      gameInfo,
      notices,
      playerInfo,
      portal,
      power,
      transport,
      world,
    } = this.#deps;

    const { primary, secondary } = partitionActions(
      data.player.actions,
      notices.actions(data),
      waiting
    );

    this.#primaryActions?.build(primary, data.player);
    this.#nextTurn?.build(
      nextTurnQueue(primary, data.player.actions, waiting),
      waiting,
      data.player
    );

    this.#secondaryActions.build(secondary);

    this.#unitActionButtons.build(
      waiting ? null : activeUnit,
      activeUnit ? world.get(activeUnit.tile.x, activeUnit.tile.y) : null
    );

    gameArea.append(this.#deps.actionArea);

    const gameDetails = new GameDetails(
      gameInfo,
      data.turn,
      data.year,
      data.difficulty
    );

    gameDetails.build();

    const playerDetails = new PlayerDetails(
      playerInfo,
      data.player,
      transport,
      {
        science: {
          key: 'F6',
          open: () => new ScienceReport(data.player),
          title: t('ScienceReport.title'),
        },
        trade: {
          key: 'F5',
          open: () => new TradeReport(data.player, portal, transport),
          title: t('TradeReport.title'),
        },
      }
    );

    playerDetails.build();

    power?.turn(Number(data.turn?.value ?? 0), data.player.id);
  }
}

export default Hud;
