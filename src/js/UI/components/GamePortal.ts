import City from './City';
import UnitSelectionWindow from './UnitSelectionWindow';
import Portal from './Portal';
import { Unit } from '../types';
import { on } from '@dom111/element';

export class GamePortal extends Portal {
  protected bindEvents(): void {
    on(this.canvas(), 'click', (event) => {
      const centerTile = this.center(),
        canvasCenterOffset = {
          x: Math.floor(this.canvas().width / 2 - this.tileSize() / 2),
          y: Math.floor(this.canvas().height / 2 - this.tileSize() / 2),
        },
        x =
          centerTile.x +
          Math.trunc(
            ((event.offsetX - canvasCenterOffset.x) / this.tileSize() +
              this.world().width()) %
              this.world().width()
          ),
        y =
          centerTile.y +
          Math.trunc(
            ((event.offsetY - canvasCenterOffset.y) / this.tileSize() +
              this.world().height()) %
              this.world().height()
          );

      const tile = this.world().get(x, y),
        playerTileUnits = tile.units.filter(
          (unit: Unit) => unit.player.id === this.playerId()
        );

      if (tile.city && tile.city.player.id === this.playerId()) {
        new City(tile.city, this, this.transport());
      } else if (playerTileUnits.length) {
        new UnitSelectionWindow(
          playerTileUnits,
          this.transport(),
          (unit: Unit) => this.emit('activate-unit', unit)
        );

        return;
      }

      this.setCenter(tile.x, tile.y);
    });
  }
}

export default GamePortal;
