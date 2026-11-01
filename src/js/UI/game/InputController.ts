import { GameData, Tile, Unit } from '../types';
import { emit, off, on } from '@dom111/element';
import { t } from 'i18next';
import { openCityStatus, openTradeReport } from '../components/reports';
import Civilopedia from '../components/Civilopedia';
import CivilizationScoreReport from '../components/CivilizationScoreReport';
import GamePortal from '../components/GamePortal';
import HappinessReport from '../components/HappinessReport';
import IntelligenceReport from '../components/IntelligenceReport';
import MilitaryReport from '../components/MilitaryReport';
import ScienceReport from '../components/ScienceReport';
import TopCitiesReport from '../components/TopCitiesReport';
import Transport from '../Transport';
import { PlayerTradeRates } from '../types';
import endTurn from '../lib/endTurn';
import { mappedKeyFromEvent } from '../lib/mappedKey';
import { openTradeRates } from '../components/Actions/AdjustTradeRates';

// A letter as typed with Shift alone deciding its case, so Caps Lock doesn't turn `p` (CleanPollution) into `P`
//  (Pillage), or `d` into `D` (Disband) (#479).
const withoutCapsLock = (key: string, event: KeyboardEvent): string =>
  /^[a-z]$/i.test(key)
    ? event.shiftKey
      ? key.toUpperCase()
      : key.toLowerCase()
    : key;

// The game's keyboard: the leader screens (F1/F3/F4/F5/F6/F8/F9), the Civilopedia (`?`), a key passed on to a modal
//  window, Shift+S to save, the unit keys, Escape, Enter to end the turn, Tab to the first action, `c`/`w`/`t`/`y`,
//  `+`/`-` for the trade rates, and the Shift+5, Shift+6 cheat sequence.
//
// Registered on `document` in the bubble phase, after `ReloadGuard` (which must stay the first bubble listener: it
//  reads whether the game has started, as F5 is the Trade Report once it has) and after `DebugPanel`'s capture-phase
//  hotkeys. It is the last `keydown` bubble listener on `document`.
//
// Reaches into the document beyond the elements it is given: a key typed while the body has the focus goes to the top
//  `dialog.window.modal[open]`, read from `document` and `document.activeElement` on each key press; Escape blurs
//  `document.activeElement`; and Tab focuses the first action button in `actionArea`.

// What answers Enter for itself, so the Next Turn button doesn't take it from it (#702).
//  A window, open but not modal (a report), keeps it too.
const takesEnter = (target: EventTarget | null): boolean =>
    target instanceof Element &&
    (target.matches(
      'button, a[href], input, select, textarea, summary, [contenteditable], [role="button"]'
    ) ||
      target.closest('dialog') !== null),
  isNextTurn = (target: EventTarget | null): boolean =>
    target instanceof Element && target.matches('.ui-next-turn');

export type InputControllerDeps = {
  // The primary actions' area, whose first button Tab focuses.
  actionArea: HTMLElement;
  // Read on every key press, so always the latest rebuild.
  data: () => GameData;
  gameMenu: { enableCheats(): void; saveGame(): void };
  // Under the new interface (#702): Enter presses the Next Turn button and Shift+Enter skips its item, in place of
  //  Enter ending the turn. Read on every key press, as the HUD makes it.
  nextTurn?: () => { press(): void; skip(): void } | null;
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
      F1: () => openCityStatus(data().player, portal, transport),
      F2: () => new MilitaryReport(transport),
      F3: () => new IntelligenceReport(transport),
      F4: () => new HappinessReport(data().player, portal, transport),
      F5: () => openTradeReport(data().player, portal, transport),
      F6: () => new ScienceReport(data().player),
      F8: () => new TopCitiesReport(transport),
      F9: () => new CivilizationScoreReport(transport),
      // Civ1 opened its Civilopedia from the menu alone (#183). F7 is free, but it is Civ1's Wonders of the World,
      //  still to come.
      '?': () => Civilopedia.open(transport),
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
        nextTurn,
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

    // The open one on top, the last in the page: a closed one isn't drawn, and shouldn't take the keys (#351).
    const modalWindow = Array.from(
      document.querySelectorAll('dialog.window.modal[open]')
    ).pop();

    // Not over a modal window, which would leave the screen drawn but out of reach until the modal one closes (#183).
    if (key in leaderScreensMap && !modalWindow) {
      leaderScreensMap[event.key]();

      event.preventDefault();
    }

    // Save Game, as the game menu's, and not over a modal window either. `S`, as `s` is Sleep. Once for a key held
    //  down, not a file for each repeat.
    if (key === 'S' && !modalWindow) {
      if (!event.repeat) {
        gameMenu.saveGame();
      }

      // Not part of the Shift+5, Shift+6 sequence below.
      this.#lastShiftedCode = '';

      event.preventDefault();

      return;
    }

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

    const button = nextTurn?.() ?? null;

    // Not from something that takes Enter itself (a button, a field), nor over a modal window. Shift+Enter on the button
    //  itself skips too: Enter alone there is the button's own click.
    if (
      button !== null &&
      (key === 'Enter' || (event.key === 'Enter' && event.shiftKey)) &&
      !modalWindow &&
      !waiting() &&
      // Once for a key held down: not a run through the queue.
      !event.repeat &&
      (!takesEnter(event.target) ||
        (event.shiftKey && isNextTurn(event.target)))
    ) {
      if (event.shiftKey) {
        button.skip();
      } else {
        button.press();
      }

      event.stopPropagation();
      event.preventDefault();

      return;
    }

    if (
      button === null &&
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
        // The first orb, or the Next Turn button (#702).
        'div.action:first-child button, button.ui-next-turn'
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

    // Adjust trade rates, when the engine offers it (#274), and not over a modal window (#183). On the key typed, so
    //  Shift+= and the numeric keypad's both count, on any layout (#662). Once for a key held down.
    if ((key === '+' || key === '-') && !modalWindow) {
      const adjustTradeRates = data().player.actions.find(
        (action) => action._ === 'AdjustTradeRates'
      );

      if (adjustTradeRates) {
        if (!event.repeat) {
          openTradeRates(adjustTradeRates.value as PlayerTradeRates, transport);
        }

        event.preventDefault();

        return;
      }
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
