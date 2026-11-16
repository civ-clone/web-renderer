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
  // The most it may be set to (M2d: Civ2's maximum rates), 100 where there's none.
  #max: number;
  #range: HTMLInputElement;
  #number: HTMLInputElement;
  #lock: HTMLInputElement;
  #listeners: onInputHandler[] = [];

  constructor(
    key: string,
    currentValue: number,
    label: string,
    max: number = 100
  ) {
    super(template(label, currentValue));

    this.#key = key;
    this.#label = label;
    this.#max = Math.min(Math.max(max, 0), 100);
    this.#range = this.element().querySelector(
      'input[type="range"]'
    ) as HTMLInputElement;
    this.#number = this.element().querySelector(
      'input[type="number"]'
    ) as HTMLInputElement;
    this.#lock = this.element().querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;

    // Each named after its rate: the legend alone leaves a screen reader saying "slider, 50" (#857).
    this.#range.setAttribute('aria-label', label);
    this.#number.setAttribute('aria-label', label);

    // A maximum below 100 is said, and the number box stops at it as the slider does.
    if (this.#max < 100) {
      const maximum = document.createElement('small');

      maximum.className = 'locked-slider-max';
      maximum.textContent = t('LockedSlider.max', { max: this.#max });
      this.#number.setAttribute('max', String(this.#max));
      this.#range.setAttribute('aria-valuemax', String(this.#max));
      this.element().querySelector('legend')!.append(' ', maximum);
    }

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

  max(): number {
    return this.#max;
  }

  /** Takes the lock off, as when the rates can only come to 100 by moving it. */
  unlock(): void {
    this.#lock.checked = false;
    this.lock();
  }

  set(value: string): void {
    const parsed = parseInt(value, 10);

    // An empty or half-typed number box ('', '-') isn't a value yet: leave every slider as it is until it is (#485).
    if (Number.isNaN(parsed)) {
      return;
    }

    value = Math.min(Math.max(parsed, 0), this.#max).toString();

    if (this.#range.value !== value) {
      this.#range.value = value;
    }

    // How far along the track the thumb is, 0 to 1, for the theme to fill it to (#739).
    this.#range.style.setProperty('--fill', String(parseInt(value, 10) / 100));

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
