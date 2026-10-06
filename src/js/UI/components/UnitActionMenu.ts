import { PopupMenu, PopupMenuAction } from './PopupMenu';
import { Tile, Unit as UnitData, UnitAction } from '../types';
import Transport from '../Transport';
import { off, on } from '@dom111/element';
import { performWithPrompts } from '../lib/unitActionPrompts';
import { t } from 'i18next';

const buildActions = (
  tile: Tile,
  unit: UnitData,
  transport: Transport
): PopupMenuAction[] => {
  let actions: UnitAction[] = [];

  if (tile === unit.tile) {
    actions = unit.actions;
  }

  const [neighbouringTileDetails] = Object.entries(
    unit.actionsForNeighbours
  ).filter(([, actions]) => {
    const [action] = actions;

    if (!action) {
      return false;
    }

    return action.to === tile;
  });

  const [, neighbouringTileActions] = neighbouringTileDetails ?? [];

  if (neighbouringTileActions) {
    actions = neighbouringTileActions;
  }

  if (tile !== unit.tile && !neighbouringTileActions?.length) {
    actions = [
      {
        _: 'GoTo',
        __: [],
        id: '',
        from: unit.tile,
        to: tile,
      },
    ];
  }

  return actions.map((action) => ({
    label: t(`Action.${action._}.name`, {
      defaultValue: action._,
      ns: 'unit',
    }),
    // Through the same windows as the arrow keys: a confirmation that would break a treaty, a Diplomat's incite and
    //  bribe windows (#58).
    action: () =>
      performWithPrompts(unit, action, actions, (chosen) =>
        transport.send('action', {
          name: 'ActiveUnit',
          id: unit.id,
          unitAction: chosen._,
          target: chosen.to.id,
        })
      ),
  }));
};

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
      const target = document.elementFromPoint(event.pageX, event.pageY);

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
