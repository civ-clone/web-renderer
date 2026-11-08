// The unit's long press menu under the new interface (#808): the shared menu over the press, headed by the unit and the
//  square it would act on, each order with the icon and key the unit card gives it (#743).

import { Tile, Unit as UnitData } from '@civ-clone/ui-client/types';
import {
  drawUnitActionIcon,
  unitActionIconLayers,
} from '@civ-clone/ui-assets/lib/unitActionIcon';
import { keyForAction, keyName } from '@civ-clone/ui-client/lib/unitActionKeys';
import Transport from '@civ-clone/ui-client/Transport';
import UiMenu from './UiMenu';
import Unit from './Unit';
import { nameOf } from '../lib/unitActionPrompts';
import { t } from 'i18next';
import { unitName } from '../lib/unitLabel';
import unitMenuActions from '../lib/unitMenuActions';

// Interpolated names are text, not HTML: they're set as `textContent`.
const text = (key: string, options: { [key: string]: unknown } = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

/** What the header says of the square: its terrain, and which way it is when it's a neighbour. */
export const squareLine = (tile: Tile, direction: string | null): string => {
  const terrain = text(`${tile.terrain._}.name`, {
    defaultValue: tile.terrain._,
    ns: 'world',
  });

  return direction === null
    ? terrain
    : text('UnitMenu.square', {
        terrain,
        direction: text(`UnitMenu.direction.${direction}`, {
          defaultValue: direction.toUpperCase(),
        }),
      });
};

const header = (
  unit: UnitData,
  tile: Tile,
  direction: string | null
): HTMLElement => {
  const element = document.createElement('div'),
    portrait = document.createElement('span'),
    name = document.createElement('p'),
    square = document.createElement('p');

  portrait.className = 'ui-menu-portrait';
  portrait.setAttribute('aria-hidden', 'true');
  portrait.append(new Unit(unit).element());

  name.className = 'ui-menu-name';
  name.textContent = unitName(unit);

  square.className = 'ui-menu-square';
  square.textContent = squareLine(tile, direction);

  element.append(portrait, name, square);

  return element;
};

/**
 * Opens the menu of what `unit` can do to `tile` at `x`, `y` in the viewport, or nothing when it can do nothing there
 *  yet. `pressed` when the press that opened it is still held: lifting it on a row gives that order. On a far square
 *  that press opens it on Go to, for letting go at once (#814); nearer, the orders can't be undone, so one is chosen.
 */
export const openUnitMenu = (
  x: number,
  y: number,
  unit: UnitData,
  tile: Tile,
  transport: Transport,
  {
    pressed = false,
    draw = drawUnitActionIcon,
  }: {
    pressed?: boolean;
    draw?: typeof drawUnitActionIcon;
  } = {}
): UiMenu | null => {
  const { actions, direction } = unitMenuActions(tile, unit, transport);

  if (actions.length === 0) {
    return null;
  }

  const ownSquare = tile === unit.tile,
    farSquare = !ownSquare && direction === null,
    icons: [HTMLCanvasElement, ReturnType<typeof unitActionIconLayers>][] = [],
    menu = new UiMenu({
      label: text('UnitMenu.label', { unit: unitName(unit) }),
      anchor: { point: { x, y } },
      header: header(unit, tile, ownSquare ? null : direction),
      pressed,
      firstRowOnPoint: pressed && farSquare,
      className: 'ui-unit-menu',
      sections: [
        {
          items: actions.map(({ action, label, run }) => {
            const canvas = document.createElement('canvas'),
              found = ownSquare ? keyForAction(nameOf(action)) : null;

            canvas.width = canvas.height = 16;
            icons.push([
              canvas,
              unitActionIconLayers(
                action,
                unit,
                unit.tile,
                t(`Action.${nameOf(action)}.icon`, {
                  defaultValue: '',
                  ns: 'unit',
                })
              ),
            ]);

            return {
              label,
              action: run,
              icon: canvas,
              key: found === null ? null : keyName(found),
            };
          }),
        },
      ],
    });

  // Drawn once they're in the page, at the size it shows them (#352).
  icons.forEach(([canvas, layers]) => draw(canvas, layers));

  return menu;
};

export default openUnitMenu;
