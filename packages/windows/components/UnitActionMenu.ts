import {
  PopupMenu,
  PopupMenuAction,
} from '@civ-clone/ui-widgets/components/PopupMenu';
import { Tile, Unit as UnitData } from '@civ-clone/ui-protocol/types';
import Transport from '@civ-clone/ui-client/Transport';
import { off, on } from '@dom111/element';
import unitMenuActions from '../lib/unitMenuActions';

// The orders, as the new interface's menu has them too (#808).
const buildActions = (
  tile: Tile,
  unit: UnitData,
  transport: Transport
): PopupMenuAction[] =>
  unitMenuActions(tile, unit, transport).actions.map(({ label, run }) => ({
    label,
    action: run,
  }));

// TODO: This won't work as a private property of UnitActionMenu... Why?
let bodyListener: (event: PointerEvent) => void = () => {};

export class UnitActionMenu extends PopupMenu {
  constructor(
    launcher: any,
    centerX: number,
    centerY: number,
    unit: UnitData,
    tile: Tile,
    transport: Transport
  ) {
    super(launcher, centerX, centerY, buildActions(tile, unit, transport), {
      align: 'center',
    });

    this.addClass('unit-actions');
  }

  build() {
    bodyListener = (event: PointerEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY);

      if (!target?.matches('.popup-menu button')) {
        return;
      }

      event.preventDefault();

      target.dispatchEvent(new PointerEvent('pointerup'));
    };

    on(document.body, 'pointerup', bodyListener);

    super.build();
  }

  remove() {
    super.remove();

    off(document.body, 'pointerup', bodyListener);
  }
}

export default UnitActionMenu;
