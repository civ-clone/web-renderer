import { GameData, Tile, Unit } from '../types';
import { emit, off, on } from '@dom111/element';
import { t } from 'i18next';
import CityStatus from '../components/CityStatus';
import CivilizationScoreReport from '../components/CivilizationScoreReport';
import GamePortal from '../components/GamePortal';
import HappinessReport from '../components/HappinessReport';
import IntelligenceReport from '../components/IntelligenceReport';
import ScienceReport from '../components/ScienceReport';
import TopCitiesReport from '../components/TopCitiesReport';
import TradeReport from '../components/TradeReport';
import Transport from '../Transport';
import endTurn from '../lib/endTurn';
import { mappedKeyFromEvent } from '../lib/mappedKey';

// A letter as typed with Shift alone deciding its case, so Caps Lock doesn't turn `p` (CleanPollution) into `P`
//  (Pillage), or `d` into `D` (Disband) (#479).
const withoutCapsLock = (key: string, event: KeyboardEvent): string =>
  /^[a-z]$/i.test(key)
    ? event.shiftKey
      ? key.toUpperCase()
      : key.toLowerCase()
    : key;

// The game's keyboard: the leader screens (F1/F3/F4/F5/F6/F8/F9), a key passed on to a modal window, the unit keys,
//  Escape, Enter to end the turn, Tab to the first action, `c`/`w`/`t`/`y`, and the Shift+5, Shift+6 cheat sequence.
//
// Registered on `document` in the bubble phase, after `ReloadGuard` (which must stay the first bubble listener: it
//  reads whether the game has started, as F5 is the Trade Report once it has) and after `DebugPanel`'s capture-phase
//  hotkeys. It is the last `keydown` bubble listener on `document`.
//
// Reaches into the document beyond the elements it is given: a key typed while the body has the focus goes to the top
//  `dialog.window.modal[open]`, read from `document` and `document.activeElement` on each key press; Escape blurs
//  `document.activeElement`; and Tab focuses the first action button in `actionArea`.

export type InputControllerDeps = {
  // The primary actions' area, whose first button Tab focuses.
  actionArea: HTMLElement;
  // Read on every key press, so always the latest rebuild.
  data: () => GameData;
  gameMenu: { enableCheats(): void };
  mapView: {
    centre(tile: Tile): void;
    toggleUnits(): void;
    toggleYields(): void;
  };
  notificationBar: { show(text: string): void };
  portal: GamePortal;
  transport: Transport;
  unitController: {
    active(): Unit | null;
    pressKey(key: string): boolean;
    wait(): void;
  };
  // Read on every key press: whether the turn has been ended and the game is waiting for the next one.
  waiting: () => boolean;
};

export class InputController {
  #deps: InputControllerDeps;
  #lastShiftedCode = '';
  #leaderScreensMap: { [key: string]: () => any };
  #listener = (event: KeyboardEvent): void => this.#keydown(event);

  constructor(deps: InputControllerDeps) {
    this.#deps = deps;

    const { data, portal, transport } = deps;

    this.#leaderScreensMap = {
      F1: () => new CityStatus(data().player, portal, transport),
      F3: () => new IntelligenceReport(transport),
      F4: () => new HappinessReport(data().player, portal, transport),
      F5: () => new TradeReport(data().player, portal, transport),
      F6: () => new ScienceReport(data().player),
      F8: () => new TopCitiesReport(transport),
      F9: () => new CivilizationScoreReport(transport),
    };

    on(document, 'keydown', this.#listener);
  }

  // Not called yet: the listener has always lasted as long as the page, and the `pagehide` teardown leaves it.
  dispose(): void {
    off(document, 'keydown', this.#listener);
  }

  #keydown(event: KeyboardEvent): void {
    const {
        actionArea,
        data,
        gameMenu,
        mapView,
        notificationBar,
        transport,
        unitController,
        waiting,
      } = this.#deps,
      leaderScreensMap = this.#leaderScreensMap;

    // None of the game's keys takes Ctrl, Cmd or Alt: those are the browser's (Ctrl+R reloads, Ctrl+F finds), and
    //  must not also build a road or fortify (#479).
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const key = withoutCapsLock(mappedKeyFromEvent(event), event);

    if (key in leaderScreensMap) {
      leaderScreensMap[event.key]();

      event.preventDefault();
    }

    // The open one on top, the last in the page: a closed one isn't drawn, and shouldn't take the keys (#351).
    const modalWindow = Array.from(
      document.querySelectorAll('dialog.window.modal[open]')
    ).pop();

    if (document.activeElement === document.body && modalWindow) {
      event.preventDefault();

      emit(
        modalWindow,
        new KeyboardEvent('keydown', {
          key: event.key,
        })
      );

      return;
    }

    // Kept while a move or another order is answered, and played once
    // it has been (#326, #543).
    if (unitController.pressKey(key)) {
      event.stopPropagation();
      event.preventDefault();

      return;
    }

    if (key === 'Escape' && document.activeElement !== null) {
      (document.activeElement as HTMLElement).blur();

      return;
    }

    if (
      key === 'Enter' &&
      !waiting() &&
      data().player.mandatoryActions.some((action) => action._ === 'EndTurn')
    ) {
      endTurn(transport);

      event.stopPropagation();
      event.preventDefault();

      return;
    }

    if (key === 'Tab') {
      const topAction = actionArea.querySelector(
        'div.action:first-child button'
      ) as HTMLButtonElement | null;

      if (topAction !== null) {
        topAction.focus();

        event.preventDefault();
        event.stopPropagation();

        return;
      }
    }

    const activeUnit = unitController.active();

    if (key === 'c' && activeUnit) {
      mapView.centre(activeUnit.tile);

      return;
    }

    if (key === 'w' && activeUnit) {
      unitController.wait();

      event.stopPropagation();
      event.preventDefault();

      return;
    }

    if (key === 't') {
      mapView.toggleUnits();

      return;
    }

    if (key === 'y') {
      mapView.toggleYields();

      return;
    }

    // Shift+5 then Shift+6, as in Civ1: turns on the game menu's
    // cheat items for this session. Matched on the physical keys,
    // because what Shift+5 types depends on the keyboard layout.
    // Shift itself, pressed again between the two, doesn't break the
    // sequence (#479).
    if (key === 'Shift') {
      return;
    }

    const shiftedCode = event.shiftKey ? event.code : '';

    if (this.#lastShiftedCode === 'Digit5' && shiftedCode === 'Digit6') {
      gameMenu.enableCheats();

      notificationBar.show(t('GameMenu.cheat.enabled'));

      return;
    }

    this.#lastShiftedCode = shiftedCode;
  }
}

export default InputController;
