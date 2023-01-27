import City from './City';
import UnitSelectionWindow from './UnitSelectionWindow';
import Portal from './Portal';
import { Tile, Unit } from '../types';
import { on, onEach } from '@dom111/element';
import UnitActionMenu from './UnitActionMenu';

export class GamePortal extends Portal {
  #activeUnit: Unit | null = null;
  #showActionMenuTimeout: number | null = null;

  protected bindEvents(): void {
    on(this.canvas(), 'pointerup', (event) => {
      const realTarget = document.elementFromPoint(event.pageX, event.pageY);

      if (realTarget?.matches('.unit-actions *')) {
        return;
      }

      this.clearTimeout();

      const tile = this.tileFromOffsets(event.offsetX, event.offsetY),
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

    const showActionMenu = (tile: Tile, x: number, y: number) => {
      this.clearTimeout();

      if (this.#activeUnit === null) {
        return;
      }

      this.#showActionMenuTimeout = window.setTimeout(
        () =>
          new UnitActionMenu(
            this,
            x,
            y,
            this.#activeUnit as Unit,
            tile,
            this.transport()
          ),
        350
      );
    };

    // Prevent dragging address bar down by accident
    on(this.canvas(), 'touchstart', (event) => {
      event.preventDefault();
      //
      // const touch = event.touches[0];
      //
      // showActionMenu(
      //   this.tileFromOffsets(
      //     touch.pageX - this.canvas().offsetLeft,
      //     touch.pageY - this.canvas().offsetTop
      //   ),
      //   touch.pageX,
      //   touch.pageY
      // );
    });

    on(this.canvas(), 'pointerdown', (event) => {
      event.preventDefault();

      showActionMenu(
        this.tileFromOffsets(event.offsetX, event.offsetY),
        event.x,
        event.y
      );
    });
  }

  private clearTimeout() {
    if (this.#showActionMenuTimeout === null) {
      return;
    }

    window.clearTimeout(this.#showActionMenuTimeout);

    this.#showActionMenuTimeout = null;
  }

  setActiveUnit(unit: Unit | null = null) {
    this.#activeUnit = unit;
  }

  private tileFromOffsets(offsetX: number, offsetY: number): Tile {
    const centerTile = this.center(),
      canvasCenterOffset = {
        x: Math.floor(this.canvas().width / 2 - this.tileSize() / 2),
        y: Math.floor(this.canvas().height / 2 - this.tileSize() / 2),
      },
      x =
        centerTile.x +
        Math.trunc(
          ((offsetX - canvasCenterOffset.x) / this.tileSize() +
            this.world().width()) %
            this.world().width()
        ),
      y =
        centerTile.y +
        Math.trunc(
          ((offsetY - canvasCenterOffset.y) / this.tileSize() +
            this.world().height()) %
            this.world().height()
        );

    return this.world().get(x, y);
  }
}

export default GamePortal;
