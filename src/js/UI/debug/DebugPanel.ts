import { GameData, Unit } from '../types';
import createMemoryTestbed, { MemoryTestbed } from '../lib/memoryTestbed';
import Cities from '../components/Map/Cities';
import CityNames from '../components/Map/CityNames';
import DebugFlags from './DebugFlags';
import GamePortal from '../components/GamePortal';
import Minimap from '../components/Minimap';
import Transport from '../Transport';
import UIStressRunner from '../lib/UIStressRunner';
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
// `exportDebugJson` sweep every `dialog.window`, and the hotkeys listen on
// `document` in the capture phase.
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
          this.#exportDebugJson();
        }

        if (key === 'x') {
          this.#exportDebugCsv();
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
          dialog.close();
        } catch (error) {
          console.warn('Failed to close dialog', error);
        }
      });
  }

  #downloadDebugFile(
    fileName: string,
    content: string,
    mimeType: string
  ): void {
    // Direct creation rather than `s`: the `href` is an object
    // URL that has to be assigned as a property, and putting one
    // through `s` would mean interpolating it into markup for no
    // gain. The anchor never enters the tree for longer than the
    // click.
    const blob = new Blob([content], { type: mimeType }),
      url = URL.createObjectURL(blob),
      anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  #exportDebugJson(): void {
    const dialogs = Array.from(
        document.querySelectorAll('dialog.window, dialog.window.modal')
      ).map((dialogElement) => {
        const dialog = dialogElement as HTMLDialogElement,
          titleElement = dialog.querySelector(
            '.title, h1, h2, h3, legend'
          ) as HTMLElement | null;

        return {
          className: dialog.className,
          id: dialog.id || null,
          open: !!dialog.open,
          title: titleElement?.innerText?.trim() || null,
        };
      }),
      memory = (performance as any).memory,
      samples = this.#memoryTestbed?.samples ?? [],
      sampleCount = samples.length,
      heapValues = samples
        .map((sample) => sample.usedJSHeapSize)
        .filter((value): value is number => typeof value === 'number'),
      firstSample = sampleCount > 0 ? samples[0] : null,
      lastSample = sampleCount > 0 ? samples[sampleCount - 1] : null;

    const payload = {
        exportedAt: Date.now(),
        debug: {
          automatePlayerEnabled: this.#flags.automatePlayerEnabled,
          stressUiEnabled: this.#flags.stressUiEnabled,
          stressUiWindowsEnabled: this.#flags.stressUiWindowsEnabled,
        },
        stressRunner: this.#flags.uiStressRunner?.getDebugState() ?? null,
        runtime: {
          canvasCount: document.querySelectorAll('canvas').length,
          dialogCount: dialogs.length,
          dialogs,
          domNodeCount: document.querySelectorAll('*').length,
          imageCount: document.querySelectorAll('img').length,
          objectCount: this.#deps.currentObjectCount(),
          tilesPendingRender: this.#deps.tilesPendingRender(),
          turn: this.#deps.currentTurn(),
        },
        heap: {
          currentUsedJSHeapSize:
            memory && typeof memory.usedJSHeapSize === 'number'
              ? memory.usedJSHeapSize
              : null,
          jsHeapSizeLimit:
            memory && typeof memory.jsHeapSizeLimit === 'number'
              ? memory.jsHeapSizeLimit
              : null,
          totalJSHeapSize:
            memory && typeof memory.totalJSHeapSize === 'number'
              ? memory.totalJSHeapSize
              : null,
        },
        memory: this.#memoryTestbed
          ? {
              firstSample,
              heapMax: heapValues.length > 0 ? Math.max(...heapValues) : null,
              heapMin: heapValues.length > 0 ? Math.min(...heapValues) : null,
              lastSample,
              sampleCount,
              samples,
            }
          : null,
      },
      json = JSON.stringify(payload, null, 2);

    this.#downloadDebugFile(
      `civ-debug-${Date.now()}.json`,
      json,
      'application/json'
    );
  }

  #exportDebugCsv(): void {
    if (!this.#memoryTestbed) {
      this.#deps.transport.send(
        'notification',
        'No memory sampler active for CSV export.'
      );

      return;
    }

    this.#downloadDebugFile(
      `civ-memory-${Date.now()}.csv`,
      this.#memoryTestbed.exportCsv(),
      'text/csv'
    );
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
      portal,
      setActiveUnit,
      transport,
      unitsMap,
      yieldsMap,
    } = this.#deps;

    transport.send(
      'notification',
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
      this.#exportDebugJson()
    );

    const exportCsvButton = debugButton('Export memory CSV', '#224', () =>
      this.#exportDebugCsv()
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
