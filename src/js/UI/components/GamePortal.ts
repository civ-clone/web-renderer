import City from './City';
import InactiveUnitSelectionWindow from './InactiveUnitSelectionWindow';
import Portal from './Portal';
import { Unit } from '../types';

export class GamePortal extends Portal {
  protected bindEvents(): void {
    this.canvas().addEventListener('click', (event) => {
      const currentCenter = this.center();

      let x = event.offsetX,
        y = event.offsetY;

      x =
        (x - (this.canvas().width / 2 - this.tileSize())) /
          (this.tileSize() * this.scale()) +
        currentCenter.x;
      y =
        (y - (this.canvas().height / 2 - this.tileSize())) /
          (this.tileSize() * this.scale()) +
        currentCenter.y;

      while (x < 0) {
        x += this.world().width();
      }

      while (y < 0) {
        y += this.world().height();
      }

      while (x > this.world().width()) {
        x -= this.world().width();
      }

      while (y > this.world().height()) {
        y -= this.world().height();
      }

      const tile = this.world().get(Math.trunc(x), Math.trunc(y)),
        playerTileUnits = tile.units.filter(
          (unit: Unit) => unit.player.id === this.playerId()
        );

      if (tile.city && tile.city.player.id === this.playerId()) {
        new City(tile.city, this, this.transport());
      } else if (playerTileUnits.length) {
        new InactiveUnitSelectionWindow(
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
