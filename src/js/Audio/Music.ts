// Plays Civilization's AdLib music from the player's own ASOUND.CVL (#126). The driver and the synth run in
// musicWorklet.ts; this side makes the AudioContext, loads the worklet and the CVL into it, and says what to play.
//
// Browsers don't let a page start sound before the player has done something, and an AudioContext made earlier only
// warns in the console, so nothing is made until the first key press or pointer press, and then only if there is a
// CVL to play and the sound is on. A tune asked for before then is the one that starts. With no CVL, no AudioWorklet,
// or a context the browser won't start, the game is silent, as it was before, and says nothing about it.

import type { MusicMessage, MusicReply } from './musicWorklet';

/** The parts of an AudioContext Music uses. */
export interface MusicContext {
  readonly state: string;
  readonly destination: unknown;
  readonly audioWorklet?: { addModule(url: string): Promise<void> };
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close?(): Promise<void>;
}

/** The parts of an AudioWorkletNode Music uses. */
export interface MusicNode {
  readonly port: {
    postMessage(message: MusicMessage, transfer?: Transferable[]): void;
    onmessage: ((event: { data: MusicReply }) => void) | null;
  };
  connect(destination: any): unknown;
}

export interface MusicOptions {
  /** ASOUND.CVL as the player imported it, or null. */
  sound: () => Promise<ArrayBuffer | null>;
  /** The output gain, 0 (off) to 1, read whenever it may have changed. */
  gain: () => number;
  workletUrl: string;
  /** Null where there's no Web Audio. */
  createContext?: () => MusicContext | null;
  createNode?: (context: MusicContext) => MusicNode;
  /** Where the first gesture is listened for. */
  gestureTarget?: EventTarget | null;
}

const GESTURES = ['pointerdown', 'keydown'];

const defaultContext = (): MusicContext | null => {
  const AudioContextClass =
    (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;

  return AudioContextClass ? new AudioContextClass() : null;
};

const defaultNode = (context: MusicContext): MusicNode =>
  new (globalThis as any).AudioWorkletNode(context, 'opl2', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });

type Tune = { id: number; level: number };

export class Music {
  #options: MusicOptions;
  #sound: ArrayBuffer | null = null;
  #gestured = false;
  #context: MusicContext | null = null;
  #node: MusicNode | null = null;
  // Settles once the worklet is loaded and the CVL sent to it, or at once with false if it can't be.
  #starting: Promise<boolean> | null = null;
  #failed = false;
  // The tune that should be playing, or null after a fade.
  #wanted: Tune | null = null;
  // Whether the context was last asked to run, and that ask: `context.state` changes only once the audio thread has
  //  caught up, so a quick suspend and resume (the volume slider through 0) would read it stale. Each ask waits for
  //  the one before.
  #running = false;
  #transition: Promise<void> = Promise.resolve();
  #onGesture = (): void => this.#gesture();

  constructor(options: MusicOptions) {
    this.#options = options;
  }

  /** Reads the CVL and, if there is one, waits for the first gesture. Never rejects. */
  async init(): Promise<void> {
    try {
      this.#sound = await this.#options.sound();
    } catch {
      this.#sound = null;
    }

    if (this.#sound === null) {
      return;
    }

    const target =
      this.#options.gestureTarget === undefined
        ? (globalThis as any).document ?? null
        : this.#options.gestureTarget;

    GESTURES.forEach((type) =>
      target?.addEventListener(type, this.#onGesture, { capture: true })
    );
  }

  /** Whether there's a CVL to play, once `init` has settled. */
  get available(): boolean {
    return this.#sound !== null && !this.#failed;
  }

  /** Starts PlayTune `id` (3 is the main theme, 4 Evolution) at arrangement `level`, once sound can start. */
  play(id: number, level: number = 3): void {
    this.#wanted = { id, level };

    if (this.#failed) {
      return;
    }

    if (this.#node !== null) {
      this.#resume();
      this.#post({ play: this.#wanted });

      return;
    }

    this.#start();
  }

  /** Fades out whatever is playing: PlayTune 1, the driver's own fade. */
  stop(): void {
    if (this.#wanted === null) {
      return;
    }

    this.#wanted = null;

    if (this.#node !== null) {
      this.#post({ play: { id: 1, level: 3 } });
    }
  }

  /** Applies the volume option as it is now: at once, and with the context suspended while it's off or nothing's wanted. */
  volumeChanged(): void {
    const gain = this.#gain();

    if (this.#failed) {
      return;
    }

    if (this.#node === null) {
      this.#start();

      return;
    }

    this.#post({ volume: gain });

    if (gain === 0) {
      this.#suspend();
    } else if (this.#wanted !== null) {
      // With no tune wanted (after a fade, the context let go of), there's nothing to turn up: the next tune resumes
      //  it.
      this.#resume();
    }
  }

  #gain(): number {
    try {
      return Math.min(1, Math.max(0, this.#options.gain()));
    } catch {
      return 0;
    }
  }

  #gesture(): void {
    this.#gestured = true;

    const target =
      this.#options.gestureTarget === undefined
        ? (globalThis as any).document ?? null
        : this.#options.gestureTarget;

    GESTURES.forEach((type) =>
      target?.removeEventListener(type, this.#onGesture, { capture: true })
    );

    // Inside the gesture, so the browser lets the context start.
    this.#start();
  }

  #post(message: MusicMessage, transfer: Transferable[] = []): void {
    try {
      this.#node?.port.postMessage(message, transfer);
    } catch {
      // A closed context: nothing to tell.
    }
  }

  #resume(): void {
    if (!this.#failed && this.#gain() > 0) {
      this.#run(true);
    }
  }

  #suspend(): void {
    this.#run(false);
  }

  #run(running: boolean): void {
    const context = this.#context;

    if (context === null || running === this.#running) {
      return;
    }

    this.#running = running;
    this.#transition = this.#transition
      .then(() => (running ? context.resume() : context.suspend()))
      .catch((): void => {
        // Refused (a resume the browser won't allow yet): asked again next time, unless asked otherwise since.
        if (this.#running === running) {
          this.#running = !running;
        }
      });
  }

  /** Makes the context and the worklet, when there's a CVL, a gesture has been made and the sound is on. */
  #start(): Promise<boolean> {
    if (this.#starting !== null) {
      return this.#starting;
    }

    if (
      this.#sound === null ||
      this.#failed ||
      !this.#gestured ||
      this.#gain() === 0
    ) {
      return Promise.resolve(false);
    }

    let context: MusicContext | null = null;

    try {
      context = (this.#options.createContext ?? defaultContext)();
    } catch {
      context = null;
    }

    if (context === null || !context.audioWorklet) {
      this.#failed = true;

      return Promise.resolve(false);
    }

    this.#context = context;
    // Started now, inside the gesture: after the module has loaded it may be too late.
    this.#run(true);

    const started = context.audioWorklet
      .addModule(this.#options.workletUrl)
      .then((): boolean => {
        const node = (this.#options.createNode ?? defaultNode)(context!);

        node.port.onmessage = ({ data }): void => this.#receive(data);
        node.connect(context!.destination);
        this.#node = node;

        // A copy: the CVL stays here, for a context made again.
        this.#post({ load: this.#sound!.slice(0) });
        this.#post({ volume: this.#gain() });

        if (this.#wanted !== null) {
          this.#post({ play: this.#wanted });
        }

        // Turned off while the module loaded: the context started in the gesture has nothing to play yet.
        if (this.#gain() === 0) {
          this.#suspend();
        }

        return true;
      })
      .catch((): boolean => {
        this.#failed = true;
        this.#node = null;
        this.#context = null;
        // Nothing will play in it: let it go rather than leave it running.
        context!.close?.().catch((): void => {});

        return false;
      });

    this.#starting = started;

    return started;
  }

  #receive(reply: MusicReply): void {
    if (reply.error !== undefined) {
      // A CVL the worklet couldn't read: as without one.
      this.#failed = true;
      this.#suspend();

      return;
    }

    // Silent after a fade: the context is let go of until the next tune. Not while a tune is wanted, which may only
    //  be resting.
    if (reply.idle && this.#wanted === null) {
      this.#suspend();
    }
  }
}

export default Music;
