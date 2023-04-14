import { PopupMenu, PopupMenuAction } from './PopupMenu';
import { SneakAttack, Tile, Unit as UnitData, UnitAction } from '../types';
import Transport from '../Transport';
import { off, on } from '@dom111/element';
import ConfirmationWindow from './ConfirmationWindow';
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

  // TODO: when GoTo is a thing, set that here
  // if (actions.length === 0) {
  //   actions = [];
  // }

  return actions.map((action) => {
    const perform = () =>
      transport.send('action', {
        name: 'ActiveUnit',
        id: unit.id,
        unitAction: action._,
        target: action.to.id,
      });

    if (['SneakAttack', 'SneakCaptureCity'].includes(action._)) {
      return {
        label: t(`Action.${action._}.name`, {
          defaultValue: action._,
          ns: 'unit',
        }),
        action: () =>
          new ConfirmationWindow(
            t('SneakAttack.title'),
            t('SneakAttack.body', {
              nation: t(
                `${(action as SneakAttack).enemy.civilization._}.nation`,
                {
                  defaultValue: (action as SneakAttack).enemy.civilization._,
                  ns: 'civilization',
                }
              ),
            }),
            () => perform()
          ),
      };
    }

    return {
      label: t(`Action.${action._}.name`, {
        defaultValue: action._,
        ns: 'unit',
      }),
      action: () => perform(),
    };
  });
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
