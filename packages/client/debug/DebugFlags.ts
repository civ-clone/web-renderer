// The `?debug` switches and the stress runner's handle. Created in
// `Renderer.init`'s page scope rather than with the game, because the
// `chooseFromList` receiver reads `stressUiWindowsEnabled` and
// `uiStressRunner` before a game exists; `DebugPanel` writes them once one
// does. Imports nothing, so `tsconfig.json` can check it (#339).

// What the `chooseFromList` receiver and `DebugPanel` call on the stress
// runner. Structural rather than `import type UIStressRunner`, which would pull
// the components it imports into the type check.
export interface StressRunnerHandle {
  automateChoice(
    selectionWindow: { close(): void },
    choiceId: string,
    onChoose: (choiceId: string) => void
  ): void;
  getDebugState(): {
    automatingChoiceCount: number;
    enableWindows: boolean;
    openWindowCount: number;
    tick: number;
    timeoutCount: number;
  };
  isAutomatingChoice(choiceId: string): boolean;
  setWindowsEnabled(enabled: boolean): void;
  stop(): void;
}

export class DebugFlags {
  readonly debugMode: boolean;
  automatePlayerEnabled: boolean;
  stressUiEnabled: boolean;
  stressUiWindowsEnabled: boolean;
  uiStressRunner: StressRunnerHandle | null = null;

  constructor(debugMode: boolean) {
    this.debugMode = debugMode;
    this.automatePlayerEnabled = debugMode;
    this.stressUiEnabled = debugMode;
    this.stressUiWindowsEnabled = !debugMode;
  }
}

export default DebugFlags;
