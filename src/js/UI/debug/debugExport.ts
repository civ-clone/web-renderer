import DebugFlags from './DebugFlags';
import { MemoryTestbed } from '../lib/memoryTestbed';
import NotificationBar from '../app/NotificationBar';

// The `?debug=1` panel's exports (Alt+Shift+J/X and its buttons): the debug JSON and the memory samples as CSV, each
//  downloaded through a link clicked and taken away again. Moved out of `DebugPanel` (#503).
//
// Reaches into the document: `exportDebugJson` sweeps every `dialog.window` and counts the page's elements, and each
//  download appends its link to `document.body` for the click.

/** What the debug JSON reads from the game, live. */
export type DebugExportGame = {
  currentObjectCount: () => number;
  currentTurn: () => number;
  tilesPendingRender: () => number;
};

export const downloadDebugFile = (
  fileName: string,
  content: string,
  mimeType: string
): void => {
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
};

export const exportDebugJson = (
  flags: DebugFlags,
  memoryTestbed: MemoryTestbed | null,
  game: DebugExportGame
): void => {
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
    samples = memoryTestbed?.samples ?? [],
    sampleCount = samples.length,
    heapValues = samples
      .map((sample) => sample.usedJSHeapSize)
      .filter((value): value is number => typeof value === 'number'),
    firstSample = sampleCount > 0 ? samples[0] : null,
    lastSample = sampleCount > 0 ? samples[sampleCount - 1] : null;

  const payload = {
      exportedAt: Date.now(),
      debug: {
        automatePlayerEnabled: flags.automatePlayerEnabled,
        stressUiEnabled: flags.stressUiEnabled,
        stressUiWindowsEnabled: flags.stressUiWindowsEnabled,
      },
      stressRunner: flags.uiStressRunner?.getDebugState() ?? null,
      runtime: {
        canvasCount: document.querySelectorAll('canvas').length,
        dialogCount: dialogs.length,
        dialogs,
        domNodeCount: document.querySelectorAll('*').length,
        imageCount: document.querySelectorAll('img').length,
        objectCount: game.currentObjectCount(),
        tilesPendingRender: game.tilesPendingRender(),
        turn: game.currentTurn(),
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
      memory: memoryTestbed
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

  downloadDebugFile(`civ-debug-${Date.now()}.json`, json, 'application/json');
};

export const exportDebugCsv = (
  memoryTestbed: MemoryTestbed | null,
  notificationBar: Pick<NotificationBar, 'show'>
): void => {
  if (!memoryTestbed) {
    notificationBar.show('No memory sampler active for CSV export.');

    return;
  }

  downloadDebugFile(
    `civ-memory-${Date.now()}.csv`,
    memoryTestbed.exportCsv(),
    'text/csv'
  );
};
