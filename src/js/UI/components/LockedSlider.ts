import Element from './Element';
import { e, t } from '../lib/html';

const template: (label: string, value: number) => HTMLFieldSetElement = (
  label: string,
  value: number
) =>
  e(
    'fieldset',
    e('legend', t(label)),
    e(`input[type="range"][max="100"][min="0"][step="1"][value="${value}"]`),
    e('input[type="number"]'),
    e('label', e('input[type="checkbox"]'), t('Lock'))
  ) as HTMLFieldSetElement;

export type onInputHandler = () => void;

export class LockedSlider extends Element {
  #label: string;
  #range: HTMLInputElement;
  #number: HTMLInputElement;
  #lock: HTMLInputElement;
  #listeners: onInputHandler[] = [];

  constructor(label: string, currentValue: number) {
    super(template(label, currentValue));

    this.#label = label;
    this.#range = this.element().querySelector(
      'input[type="range"]'
    ) as HTMLInputElement;
    this.#number = this.element().querySelector(
      'input[type="number"]'
    ) as HTMLInputElement;
    this.#lock = this.element().querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;

    this.build();
  }

  build(): void {
    this.set(this.#range.value);

    this.#range.addEventListener('input', () => this.set(this.#range.value));

    this.#number.addEventListener('input', () => this.set(this.#number.value));

    this.#lock.addEventListener('input', () => this.lock());

    this.lock();
  }

  label(): string {
    return this.#label;
  }

  private lock(): void {
    if (this.isLocked()) {
      this.#range.setAttribute('disabled', '');
      this.#number.setAttribute('disabled', '');

      return;
    }

    this.#range.removeAttribute('disabled');
    this.#number.removeAttribute('disabled');
  }

  onInput(handler: onInputHandler): void {
    this.#listeners.push(handler);
  }

  isLocked(): boolean {
    return this.#lock.checked;
  }

  set(value: string): void {
    value = Math.max(parseInt(value, 10), 0).toString();

    if (this.#range.value !== value) {
      this.#range.value = value;
    }

    if (this.#number.value !== value) {
      this.#number.value = value;
    }

    this.#listeners.forEach((listener) => listener());
  }

  value(): number {
    return parseInt(this.#range.value, 10);
  }
}

export default LockedSlider;
