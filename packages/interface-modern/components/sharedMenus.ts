import UiMenu, { openMenu } from './UiMenu';
import { MapMenus } from '@civ-clone/ui-menus/components/mapMenus';
import { h } from '@civ-clone/ui-widgets/lib/html';
import openUnitMenu from './UiUnitMenu';
import { t } from 'i18next';

// The modern interface's menus (#808): one menu for the Game menu and the unit's, which a right-click on the map opens
//  as a long press does.

export const sharedMenus: MapMenus = {
  // The menu under the button, or closed when it's open: the button toggles it. It takes its keys from the page while
  //  it is open, so the button's own Enter and Space are left alone.
  gameMenuButton: (button, _owner, rows) => {
    let menu: UiMenu | null = null;

    button.setAttribute('aria-expanded', 'false');

    h(button, {
      click: (event: MouseEvent) => {
        // From the keyboard, a click with no pointer behind it.
        const byKeyboard = event.detail === 0;

        if (menu?.isOpen()) {
          menu.close({ restoreFocus: byKeyboard });

          return;
        }

        const { game, reports, reference, cheats, end } = rows();

        menu = new UiMenu({
          label: t('GameMenu.label'),
          launcher: button,
          byKeyboard,
          anchor: { below: button.getBoundingClientRect() },
          className: 'ui-game-menu',
          sections: [
            { items: game },
            { heading: t('GameMenu.section.reports'), items: reports },
            { heading: t('GameMenu.section.reference'), items: reference },
            { heading: t('GameMenu.section.cheats'), items: cheats },
            { rule: true, items: end },
          ],
        });
      },
    });
  },
  // Over the press, which a finger slides onto and lifts from.
  unitMenu: (_launcher, x, y, unit, tile, transport, pressed) => {
    openUnitMenu(x, y, unit, tile, transport, { pressed });
  },
  unitMenuOnRightClick: true,
  isOpen: () => openMenu() !== null,
};

export default sharedMenus;
