import {
  GameData,
  PlayerAction,
  Tile,
  Unit,
} from '@civ-clone/ui-protocol/types';
import Actions from '@civ-clone/ui-windows/components/Actions';
import GameDetails from '@civ-clone/ui-windows/components/GameDetails';
import Dismissals from '@civ-clone/ui-client/lib/dismissals';
import Notices from '@civ-clone/ui-windows/components/Notices';
import PlayerDetails from '@civ-clone/ui-windows/components/PlayerDetails';
import Portal from '@civ-clone/ui-map/components/Portal';
import ScienceReport from '@civ-clone/ui-windows/components/ScienceReport';
import PowerList from '@civ-clone/ui-windows/components/PowerList';
import { openTradeReport } from '@civ-clone/ui-windows/components/reports';
import Transport from '@civ-clone/ui-client/Transport';
import { UnitPanel } from '@civ-clone/ui-windows/components/unitPanel';
import { actionKey } from '@civ-clone/ui-client/lib/nextTurnQueue';
import partitionActions from '@civ-clone/ui-client/lib/playerActionPanels';
import turnControls, {
  NextTurnControl,
  TurnControls,
} from '@civ-clone/ui-windows/components/turnControls';
import { t } from 'i18next';

// The panels around the map: the player's actions (the end-turn area, which the interface's `turnControls` fill
//  (#860), and the secondary panel), the active unit's action buttons, and the game and player details. Rebuilt from
//  the latest data on every render. The sidebar's Power list is told the turn, and asks for itself on a new one (#701,
//  #708).
//
// Reaches beyond its own panels in one place: `build` moves the primary panel to the end of `gameArea` when it isn't
//  there already. Not every time: a panel put back in the page plays its rows' entrance again (#416).

export type HudDeps = {
  actionArea: HTMLElement;
  // The Next Turn button's units item (#702), under an interface that has one: the map centred on the active unit.
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
  // The active unit's actions, as the interface shows them (#860).
  unitActions: Pick<UnitPanel, 'actions'>;
  // For the active unit's tile, as the world holds it.
  world: { get(x: number, y: number): Tile };
};

export class Hud {
  #deps: HudDeps;
  #dismissals: Dismissals;
  #turn = 0;
  // The end-turn area, as the interface fills it (#860).
  #turnControls: TurnControls;
  #secondaryActions: Actions;

  constructor(deps: HudDeps) {
    this.#deps = deps;

    const { actionArea, portal, secondaryActionArea, transport } = deps;

    this.#dismissals = deps.dismissals ?? new Dismissals();

    this.#turnControls = turnControls.current()(actionArea, {
      centreActiveUnit: deps.centreActiveUnit ?? (() => {}),
      dismiss: (action): void => this.#dismiss(action),
      portal,
      transport,
    });
    this.#secondaryActions = new Actions(
      secondaryActionArea,
      portal,
      transport
    );
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

  /** The Next Turn button, if the interface has one: Enter and Shift+Enter press and skip it (`InputController`). */
  nextTurn(): NextTurnControl | null {
    return this.#turnControls.nextTurn();
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

    this.#turn = Number(data.turn?.value ?? 0);

    this.#turnControls.build({
      primary,
      // What the player hasn't dismissed this turn (#416).
      kept: primary.filter(
        (action) => !this.#dismissals.has(actionKey(action), this.#turn)
      ),
      actions: data.player.actions,
      waiting,
      player: data.player,
      turn: this.#turn,
    });

    this.#secondaryActions.build(secondary);

    this.#deps.unitActions.actions(
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
          open: () => openTradeReport(data.player, portal, transport),
          title: t('TradeReport.title'),
        },
      }
    );

    playerDetails.build();

    power?.turn(Number(data.turn?.value ?? 0), data.player.id);
  }
}

export default Hud;
