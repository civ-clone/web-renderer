import { GameData, PlayerAction, Tile, Unit } from '../types';
import Actions from '../components/Actions';
import GameDetails from '../components/GameDetails';
import Dismissals from '../lib/dismissals';
import NextTurn from '../components/NextTurn';
import NotificationRows from '../components/NotificationRows';
import Notices from '../components/Notices';
import PlayerDetails from '../components/PlayerDetails';
import Portal from '../components/Portal';
import ScienceReport from '../components/ScienceReport';
import PowerList from '../components/PowerList';
import TradeReport from '../components/TradeReport';
import Transport from '../Transport';
import UnitActions from '../components/UnitActions';
import UnitCardActions from '../components/UnitCardActions';
import { interfaceMode } from '../lib/interfaceMode';
import nextTurnQueue, { actionKey } from '../lib/nextTurnQueue';
import partitionActions from '../lib/playerActionPanels';
import { s } from '@dom111/element';
import { t } from 'i18next';

// The panels around the map: the player's actions (the end-turn area and the secondary panel), the active unit's
//  action buttons, and the game and player details. Rebuilt from the latest data on every render. The sidebar's Power
//  list is told the turn, and asks for itself on a new one (#701, #708).
//
// Reaches beyond its own panels in one place: `build` moves the primary panel to the end of `gameArea` when it isn't
//  there already. Not every time: a panel put back in the page plays its rows' entrance again (#416).

export type HudDeps = {
  actionArea: HTMLElement;
  // The Next Turn button's units item (#702): the map centred on the active unit.
  centreActiveUnit?: () => void;
  // A notification dismissed (#416): drawn again, and auto end turn looked at again, now rather than at the next update.
  changed?: () => void;
  // The notifications dismissed this turn (#416), which auto end turn reads too.
  dismissals?: Dismissals;
  // The game's turn now, which a dismissal is for: the data's, which may be newer than the last render's (#416).
  turn?: () => number;
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
  #notificationRows: NotificationRows | null = null;
  #dismissals: Dismissals;
  #turn = 0;
  #primaryActions: Actions | null = null;
  #secondaryActions: Actions;
  #unitActionButtons: UnitActions | UnitCardActions;

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

    this.#dismissals = deps.dismissals ?? new Dismissals();

    if (interfaceMode() === 'new') {
      // The notification rows (#416) over the Next Turn button (#702), in the primary panel's place.
      const rows = s('<div class="ui-notification-rows"></div>'),
        next = s('<div class="ui-next-turn-area"></div>');

      actionArea.replaceChildren(rows, next);

      this.#notificationRows = new NotificationRows(rows, {
        dismiss: (action): void => this.#dismiss(action),
        portal,
        transport,
      });
      this.#nextTurn = new NextTurn(next, {
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
    // Under the new interface, inside the active unit's card (#743), which `unitActionArea` is then.
    this.#unitActionButtons =
      interfaceMode() === 'new'
        ? new UnitCardActions(unitActionArea, unitAction)
        : new UnitActions(unitActionArea, unitAction);
  }

  // A notice is gone for good, as opening it makes it; a city in disorder for the rest of the turn.
  #dismiss(action: PlayerAction): void {
    if (action._ === 'Notice') {
      (action.value as unknown as { dismiss(): void }).dismiss();
    } else {
      this.#dismissals.dismiss(
        actionKey(action),
        this.#deps.turn?.() ?? this.#turn
      );
    }

    this.#deps.changed?.();
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

    this.#turn = Number(data.turn?.value ?? 0);

    // What the player hasn't dismissed this turn (#416).
    const kept = primary.filter(
      (action) => !this.#dismissals.has(actionKey(action), this.#turn)
    );

    this.#notificationRows?.build(
      kept.filter((action) => ['CivilDisorder', 'Notice'].includes(action._)),
      data.player
    );
    this.#nextTurn?.build(
      nextTurnQueue(kept, data.player.actions, waiting),
      waiting,
      data.player,
      this.#turn
    );

    this.#secondaryActions.build(secondary);

    this.#unitActionButtons.build(
      waiting ? null : activeUnit,
      activeUnit ? world.get(activeUnit.tile.x, activeUnit.tile.y) : null
    );

    if (gameArea.lastElementChild !== this.#deps.actionArea) {
      gameArea.append(this.#deps.actionArea);
    }

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
