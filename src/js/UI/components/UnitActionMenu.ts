import { Element, off, on, onEach, s } from '@dom111/element';
import { Tile, Unit as UnitData, UnitAction } from '../types';
import Transport from '../../Engine/Transport';
import { h } from '../lib/html';

export class UnitActionMenu extends Element {
  #bodyListener: (event: PointerEvent) => void = () => {};
  #centerX: number;
  #centerY: number;
  #tile: Tile;
  #transport: Transport;
  #unit: UnitData;

  constructor(
    centerX: number,
    centerY: number,
    unit: UnitData,
    tile: Tile,
    transport: Transport
  ) {
    super(s(`<div class="unit-actions hide"></div>`));

    this.#centerX = centerX;
    this.#centerY = centerY;
    this.#tile = tile;
    this.#transport = transport;
    this.#unit = unit;

    this.build();
  }

  private actions(): UnitAction[] {
    if (this.#tile === this.#unit.tile) {
      return this.#unit.actions;
    }

    const [neighbouringTileDetails] = Object.entries(
      this.#unit.actionsForNeighbours
    ).filter(([, actions]) => {
      const [action] = actions;

      if (!action) {
        return false;
      }

      return action.to === this.#tile;
    });

    const [, neighbouringTileActions] = neighbouringTileDetails ?? [];

    if (neighbouringTileActions) {
      return neighbouringTileActions;
    }

    // TODO: when GoTo is a thing, return that here
    return [];
  }

  build() {
    const actions = this.actions();

    if (actions.length === 0) {
      this.remove();

      return;
    }

    this.element().style.setProperty('left', this.#centerX + 'px');
    this.element().style.setProperty('top', this.#centerY + 'px');

    this.removeClass('hide');

    this.append(
      ...actions.map((action) => {
        const button = s(`<button>${action._}</button>`);

        on(button, 'pointerup', () => {
          this.#transport.send('action', {
            name: 'ActiveUnit',
            id: this.#unit.id,
            unitAction: action._,
            target: action.to.id,
          });

          this.remove();
        });

        return button;
      }),
      h(s(`<button class="close" aria-label="Close">&times;</button>`), {
        pointerup: () => this.remove(),
      })
    );

    this.#bodyListener = (event: PointerEvent) => {
      const target = document.elementFromPoint(event.pageX, event.pageY);

      if (!target?.matches('.unit-actions button')) {
        return;
      }

      event.preventDefault();

      target.dispatchEvent(new PointerEvent('pointerup'));
    };

    on(document.body, 'pointerup', this.#bodyListener);
  }

  remove() {
    this.addClass('hide');

    setTimeout(() => {
      super.remove();

      off(document.body, 'pointerup', this.#bodyListener);
    }, 250);
  }
}

export default UnitActionMenu;
