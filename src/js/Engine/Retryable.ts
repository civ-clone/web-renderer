import RetryFailed from './Error/RetryFailed';

export class Retryable {
  #attempt = 0;
  #done: Promise<void>;
  #handler: () => boolean;
  #maxTries: number;
  #reference: NodeJS.Timeout;
  #reject?: (reason?: any) => void;
  #resolve?: (value: void | PromiseLike<void>) => void;

  constructor(handler: () => boolean, maxTries = 5, interval = 100) {
    this.#handler = handler;
    this.#maxTries = maxTries;

    this.#reference = setInterval(() => this.run(), interval);
    this.#done = new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  run(): void {
    if (++this.#attempt > this.#maxTries) {
      clearInterval(this.#reference);

      this.#reject!(
        new RetryFailed('Retry failed.', this.#handler, this.#attempt)
      );

      return;
    }

    if (this.#handler()) {
      clearInterval(this.#reference);

      this.#resolve!();
    }
  }

  then(): Promise<void> {
    return this.#done;
  }
}

export default Retryable;
