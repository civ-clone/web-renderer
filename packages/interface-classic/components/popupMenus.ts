import PopupMenu, {
  hasPopupMenu,
} from '@civ-clone/ui-component-popup-menu/PopupMenu';
import { MapMenus } from '@civ-clone/ui-windows/components/mapMenus';
import UnitActionMenu from './UnitActionMenu';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { t } from 'i18next';

// The classic interface's menus: popups, the Game menu's a list in its old order and the unit's a long press's. A
//  right-click on the map is the browser's own.

export const popupMenus: MapMenus = {
  gameMenuButton: (button, owner, rows) => {
    // Whether the menu was open as the button was pressed: that press closes it, as any press does, and its click
    //  mustn't open it again (#710).
    let openAtPress = false;

    h(button, {
      // Enter and Space on the button are the button's own, to open its menu (#853): kept from the game, where Enter
      //  ends the turn and Space is an order, either of which would be done instead.
      keydown: (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation();
        }
      },
      pointerdown: () => {
        openAtPress = hasPopupMenu(owner);
      },
      click: (event: MouseEvent) => {
        const closedByThisPress = openAtPress && event.detail !== 0;

        openAtPress = false;

        if (closedByThisPress) {
          return;
        }

        // Where the button is on the page: the menu is appended to the body, and the button is in the top bar's flow,
        //  not placed by the game menu itself (#697).
        const { left, top } = button.getBoundingClientRect(),
          { game, reports, reference, cheats, end } = rows();

        new PopupMenu(
          owner,
          left + window.scrollX,
          top + window.scrollY,
          [...game, ...end, ...reports, ...reference, ...cheats].map(
            ({ label, action }) => ({ label, action: () => action() })
          ),
          {
            align: 'right',
            // From the keyboard, a click with no pointer behind it: the first item takes the focus (#853).
            byKeyboard: event.detail === 0,
            fullWidth: true,
            label: t('GameMenu.label'),
            restoreFocus: button,
          }
        );
      },
    });
  },
  unitMenu: (launcher, x, y, unit, tile, transport) => {
    new UnitActionMenu(launcher, x, y, unit, tile, transport);
  },
  unitMenuOnRightClick: false,
  // Its popups don't hold back the map's tooltips.
  isOpen: () => false,
};

export default popupMenus;
