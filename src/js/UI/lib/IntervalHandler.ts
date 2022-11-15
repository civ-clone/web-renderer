export interface IIntervalHandler {
  check(): void;
  clear(): void;
  off(handler: () => void): void;
  on(handler: () => void): void;
  pause(): void;
  isPaused(): boolean;
  resume(): void;
}

export class IntervalHandler implements IIntervalHandler {
  #paused: boolean = false;
  #stack: (() => void)[] = [];

  constructor(tick: number = 500) {
    setInterval(() => this.check(), tick);
  }

  check(): void {
    if (this.#paused) {
      return;
    }

    this.#stack.forEach((item) => item());
  }

  clear(): void {
    this.#stack = [];
  }

  off(handler: () => void): void {
    this.#stack = this.#stack.filter((item) => item !== handler);
  }

  on(handler: () => void): void {
    this.#stack.push(handler);
  }

  pause(): void {
    this.#paused = true;
  }

  isPaused(): boolean {
    return this.#paused;
  }

  resume(): void {
    this.#paused = false;
  }
}

export default IntervalHandler;
