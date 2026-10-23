import { GameData, Unit } from '../types';
import createMemoryTestbed, { MemoryTestbed } from '../lib/memoryTestbed';
import Cities from '../components/Map/Cities';
import CityNames from '../components/Map/CityNames';
import DebugFlags from './DebugFlags';
import GamePortal from '../components/GamePortal';
import Minimap from '../components/Minimap';
import NotificationBar from '../app/NotificationBar';
import Transport from '../Transport';
import UIStressRunner from '../lib/UIStressRunner';
import { exportDebugCsv, exportDebugJson } from './debugExport';
import Units from '../components/Map/Units';
import Yields from '../components/Map/Yields';
import { h } from '../lib/html';
import { s } from '@dom111/element';

// What the panel reads from the game. The values that change during a game are
// getters, so the panel and the stress runner read the live value rather than
// the one there was when the panel was made.
export type DebugPanelDeps = {
  citiesMap: Cities;
  cityNamesMap: CityNames;
  currentObjectCount: () => number;
  currentTurn: () => number;
  data: () => GameData;
  minimap: Minimap;
  // Where the panel's notices show. Not `transport.send('notification')`: that
  // channel only comes from the worker.
  notificationBar: NotificationBar;
  portal: GamePortal;
  setActiveUnit: (unit: Unit | null) => void;
  tilesPendingRender: () => number;
  transport: Transport;
  unitsMap: Units;
  yieldsMap: Yields;
};

// The `?debug=1` tooling: the memory testbed (`window.__civMemoryTestbed`),
// the stress runner, and the panel with its Alt+Shift+S/A/W/C/J/X hotkeys.
// With debug off it builds nothing but starts the stress runner if
// `flags.stressUiEnabled` says so (which is only ever set by debug).
//
// Reaches into the document beyond its own panel: `closeOpenDialogs` and
// `exportDebugJson` (`debugExport.ts`) sweep every `dialog.window`, and the
// hotkeys listen on `document` in the capture phase.
export class DebugPanel {
  #debugControls: HTMLDivElement | null = null;
  #debugKeyListener: ((event: KeyboardEvent) => void) | null = null;
  #deps: DebugPanelDeps;
  #flags: DebugFlags;
  #memoryTestbed: MemoryTestbed | null;

  // In debug, tell the worker to automate the local player. Sent from
  // `Renderer.init` before the game is loaded, not from the panel.
  static automateLocalPlayer(flags: DebugFlags, transport: Transport): void {
    if (flags.debugMode) {
      transport.send('setOption', {
        name: 'automateLocalPlayer',
        value: flags.automatePlayerEnabled,
      });
    }
  }

  constructor(flags: DebugFlags, deps: DebugPanelDeps) {
    this.#flags = flags;
    this.#deps = deps;

    const profileMemory = flags.debugMode,
      memoryMaxSamples = flags.debugMode ? 5000 : null;

    this.#memoryTestbed = profileMemory
      ? createMemoryTestbed(
          () => ({
            turn: deps.currentTurn(),
            objectCount: deps.currentObjectCount(),
          }),
          {
            maxSamples: memoryMaxSamples,
          }
        )
      : null;

    if (this.#memoryTestbed) {
      window.__civMemoryTestbed = this.#memoryTestbed;
    }

    if (flags.stressUiEnabled) {
      this.#startStressRunner();
    }

    if (flags.debugMode) {
      this.#debugControls = s<HTMLDivElement>(
        `<div style="
                  position: fixed;
                  top: .5rem;
                  right: .5rem;
                  z-index: 2147483647;
                  width: 220px;
                  padding: .5rem;
                  background: rgba(0, 0, 0, .85);
                  color: #fff;
                  border: 1px solid #888;
                  font-family: monospace;
                  font-size: 12px;
                "></div>`
      );

      this.#renderDebugControls();
      document.body.append(this.#debugControls);

      this.#debugKeyListener = (event: KeyboardEvent) => {
        if (!(event.altKey && event.shiftKey)) {
          return;
        }

        const key = event.key.toLowerCase();

        if (!['s', 'a', 'w', 'c', 'j', 'x'].includes(key)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (key === 's') {
          this.#setStressUi(!this.#flags.stressUiEnabled);
        }

        if (key === 'a') {
          this.#setAutomatePlayer(!this.#flags.automatePlayerEnabled);
        }

        if (key === 'w') {
          this.#setStressUiWindows(!this.#flags.stressUiWindowsEnabled);
        }

        if (key === 'c') {
          this.#closeOpenDialogs();
        }

        if (key === 'j') {
          exportDebugJson(this.#flags, this.#memoryTestbed, this.#deps);
        }

        if (key === 'x') {
          exportDebugCsv(this.#memoryTestbed, this.#deps.notificationBar);
        }

        this.#renderDebugControls();
      };

      // Not `h`: this listens on `document` rather than on an
      // element built here, and it needs the capture phase so the
      // debug hotkeys fire before a focused dialog swallows them —
      // neither of which `h(element, handlers)` expresses.
      document.addEventListener('keydown', this.#debugKeyListener, true);
    }
  }

  // Called from the `pagehide` teardown.
  dispose(): void {
    this.#memoryTestbed?.stop();
    this.#stopStressRunner();
    this.#debugControls?.remove();

    if (this.#debugKeyListener) {
      document.removeEventListener('keydown', this.#debugKeyListener, true);
    }
  }

  #closeOpenDialogs(): void {
    document
      .querySelectorAll('dialog.window, dialog.window.modal')
      .forEach((dialogElement) => {
        const dialog = dialogElement as HTMLDialogElement;

        if (!dialog.open || typeof dialog.close !== 'function') {
          return;
        }

        try {
          // Past `Window`'s own handling, which shows a window that can't be closed again (#351): this is the way out
          //  of a stuck prompt.
          dialog.dataset.forceClose = 'true';
          dialog.close();
        } catch (error) {
          console.warn('Failed to close dialog', error);
        }
      });
  }

  #startStressRunner(): void {
    if (this.#flags.uiStressRunner) {
      return;
    }

    const {
      citiesMap,
      cityNamesMap,
      data,
      minimap,
      notificationBar,
      portal,
      setActiveUnit,
      transport,
      unitsMap,
      yieldsMap,
    } = this.#deps;

    notificationBar.show(
      `Stress harness: windows ${
        this.#flags.stressUiWindowsEnabled ? 'enabled' : 'disabled'
      }`
    );

    this.#flags.uiStressRunner = new UIStressRunner({
      enableWindows: this.#flags.stressUiWindowsEnabled,
      getData: () => data(),
      portal,
      setActiveUnit: (unit) => setActiveUnit(unit),
      toggleViewModes: [
        () => {
          yieldsMap.setVisible(!yieldsMap.isVisible());
          portal.render();
          minimap.update();
        },
        () => {
          unitsMap.setVisible(!unitsMap.isVisible());
          citiesMap.setVisible(!citiesMap.isVisible());
          cityNamesMap.setVisible(!cityNamesMap.isVisible());
          portal.render();
          minimap.update();
        },
      ],
      transport,
    });
  }

  #stopStressRunner(): void {
    this.#flags.uiStressRunner?.stop();
    this.#flags.uiStressRunner = null;
  }

  #setAutomatePlayer(enabled: boolean): void {
    this.#flags.automatePlayerEnabled = enabled;

    this.#deps.transport.send('setOption', {
      name: 'automateLocalPlayer',
      value: this.#flags.automatePlayerEnabled,
    });
  }

  #setStressUi(enabled: boolean): void {
    this.#flags.stressUiEnabled = enabled;

    if (this.#flags.stressUiEnabled) {
      this.#startStressRunner();

      return;
    }

    this.#stopStressRunner();
  }

  #setStressUiWindows(enabled: boolean): void {
    this.#flags.stressUiWindowsEnabled = enabled;
    this.#flags.uiStressRunner?.setWindowsEnabled(
      this.#flags.stressUiWindowsEnabled
    );
  }

  #renderDebugControls(): void {
    const debugControls = this.#debugControls;

    if (!debugControls) {
      return;
    }

    debugControls.innerHTML = '';

    const title = s(
      '<div style="font-weight: bold; margin-bottom: .5rem">Debug Controls</div>'
    );

    // One button shape, five buttons. The styling was repeated
    // inline nine times per button before; the only things that
    // actually differ are the label, the background and whether
    // the last one carries a bottom margin.
    const debugButton = (
      label: string,
      background: string,
      handler: () => void,
      extraStyle: string = ''
    ): HTMLButtonElement =>
      h(
        s<HTMLButtonElement>(
          `<button type="button" style="
                        display: block;
                        width: 100%;
                        margin-bottom: .375rem;
                        padding: .375rem .5rem;
                        border: 1px solid #666;
                        background: ${background};
                        color: #fff;
                        cursor: pointer;
                        ${extraStyle}
                      ">${label}</button>`
        ),
        { click: handler }
      );

    const makeToggle = (
      label: string,
      enabled: boolean,
      handler: () => void
    ): HTMLButtonElement =>
      debugButton(
        `${label}: ${enabled ? 'ON' : 'OFF'}`,
        enabled ? '#063' : '#444',
        handler
      );

    debugControls.append(
      title,
      makeToggle('Stress', this.#flags.stressUiEnabled, () => {
        this.#setStressUi(!this.#flags.stressUiEnabled);
        this.#renderDebugControls();
      }),
      makeToggle('Automate Player', this.#flags.automatePlayerEnabled, () => {
        this.#setAutomatePlayer(!this.#flags.automatePlayerEnabled);
        this.#renderDebugControls();
      }),
      makeToggle('Stress Windows', this.#flags.stressUiWindowsEnabled, () => {
        this.#setStressUiWindows(!this.#flags.stressUiWindowsEnabled);
        this.#renderDebugControls();
      })
    );

    const closeDialogsButton = debugButton('Close open dialogs', '#333', () =>
      this.#closeOpenDialogs()
    );

    const exportJsonButton = debugButton('Export debug JSON', '#224', () =>
      exportDebugJson(this.#flags, this.#memoryTestbed, this.#deps)
    );

    const exportCsvButton = debugButton('Export memory CSV', '#224', () =>
      exportDebugCsv(this.#memoryTestbed, this.#deps.notificationBar)
    );

    // The last button in the panel, so no bottom margin.
    const stopAllButton = debugButton(
      'Stop all automation',
      '#700',
      () => {
        this.#setStressUi(false);
        this.#setAutomatePlayer(false);
        this.#closeOpenDialogs();
        this.#renderDebugControls();
      },
      'margin-bottom: 0;'
    );

    const hint = s(
      '<div style="margin-top: .5rem; font-size: 11px; opacity: .85">' +
        'Hotkeys: Alt+Shift+S/A/W/C/J/X' +
        '</div>'
    );

    debugControls.append(
      closeDialogsButton,
      exportJsonButton,
      exportCsvButton,
      stopAllButton,
      hint
    );
  }
}

export default DebugPanel;
