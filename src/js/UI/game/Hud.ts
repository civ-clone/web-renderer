import { GameData, Tile, Unit } from '../types';
import Actions from '../components/Actions';
import GameDetails from '../components/GameDetails';
import Notices from '../components/Notices';
import PlayerDetails from '../components/PlayerDetails';
import Portal from '../components/Portal';
import Transport from '../Transport';
import UnitActions from '../components/UnitActions';
import partitionActions from '../lib/playerActionPanels';

// The panels around the map: the player's actions (the end-turn area and the secondary panel), the active unit's
//  action buttons, and the game and player details. Rebuilt from the latest data on every render.
//
// Reaches beyond its own panels in one place: `build` appends the primary panel to `gameArea` every time, which moves
//  it to the end of the game area.

export type HudDeps = {
  actionArea: HTMLElement;
  gameArea: HTMLElement;
  gameInfo: HTMLElement;
  // Page-scoped, and cleared by the `document` `endturn` event: its notices are added to the primary panel each time.
  notices: Pick<Notices, 'actions'>;
  playerInfo: HTMLElement;
  portal: Portal;
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
  #primaryActions: Actions;
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

    this.#primaryActions = new Actions(actionArea, portal, transport);
    this.#secondaryActions = new Actions(
      secondaryActionArea,
      portal,
      transport
    );
    this.#unitActionButtons = new UnitActions(unitActionArea, unitAction);
  }

  build(data: GameData, activeUnit: Unit | null, waiting: boolean): void {
    const { gameArea, gameInfo, notices, playerInfo, world } = this.#deps;

    const { primary, secondary } = partitionActions(
      data.player.actions,
      notices.actions(data),
      waiting
    );

    this.#primaryActions.build(primary, data.player);

    this.#secondaryActions.build(secondary);

    this.#unitActionButtons.build(
      waiting ? null : activeUnit,
      activeUnit ? world.get(activeUnit.tile.x, activeUnit.tile.y) : null
    );

    gameArea.append(this.#primaryActions.element());

    const gameDetails = new GameDetails(
      gameInfo,
      data.turn,
      data.year,
      data.difficulty
    );

    gameDetails.build();

    const playerDetails = new PlayerDetails(playerInfo, data.player);

    playerDetails.build();
  }
}

export default Hud;
