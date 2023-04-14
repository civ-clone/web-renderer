import { Element, s } from '@dom111/element';
import { t } from 'i18next';

const template: (label: string, value: number) => HTMLFieldSetElement = (
  label: string,
  value: number
) =>
  s(
    `<fieldset><legend>${label}</legend><input type="range" max="100" min="0" step="1" value="${value}"><input type="number"><label><input type="checkbox">${t(
      'LockedSlider.lock'
    )}</label></fieldset>`
  ) as HTMLFieldSetElement;

export type onInputHandler = () => void;

export class LockedSlider extends Element {
  #key: string;
  #label: string;
  #range: HTMLInputElement;
  #number: HTMLInputElement;
  #lock: HTMLInputElement;
  #listeners: onInputHandler[] = [];

  constructor(key: string, currentValue: number, label: string) {
    super(template(label, currentValue));

    this.#key = key;
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

  key(): string {
    return this.#key;
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
