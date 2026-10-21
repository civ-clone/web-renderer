import MandatorySelection from './MandatorySelection';
import { TopologyId } from '../lib/topologyFor';
import supportedTopologies from '../lib/supportedTopologies';
import { t } from 'i18next';

/**
 * Which grid the map is on: square, isometric or hex (#89). The first question of New Game and Customize World, and
 * fixed for the rest of the game. Only the grids that can be drawn are offered, so while that is only square the
 * question answers itself and is never shown (#148). Earth is square, so it never asks.
 */
export class MapGridWindow extends MandatorySelection {
  constructor(grids: TopologyId[], onChoose: (grid: TopologyId) => void) {
    super(
      t('NewGameWindow.map-grid'),
      grids.map((grid) => ({
        label: t(`Grid.${grid}`) as string,
        value: grid,
      })),
      (selection) => {
        this.close();

        onChoose(selection as TopologyId);
      },
      undefined,
      {
        modal: true,
      }
    );

    this.selectionList().value = grids[0];
  }

  /** Asks the player for one of the grids that can be drawn. */
  static ask(onChoose: (grid: TopologyId) => void): MapGridWindow {
    return new MapGridWindow(supportedTopologies(), onChoose);
  }
}

export default MapGridWindow;
