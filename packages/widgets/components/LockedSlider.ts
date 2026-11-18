import { Element, s } from '@dom111/element';
import { glyph } from '@civ-clone/ui-platform/lib/glyphs';
import { t } from 'i18next';

// One row (#1058): an optional icon and the name, the track, a narrow number box to type into, and a lock that holds
//  the value while the others move. The lock is a toggle button, sized for a finger, with the rate's name for a screen
//  reader.
const template = (label: string, value: number): HTMLElement => {
  const row = s(
      `<div class="locked-slider" role="group"><span class="locked-slider-icon"></span><span class="locked-slider-name"></span><input type="range" max="100" min="0" step="1" value="${value}"><input type="number" inputmode="numeric" min="0"><button type="button" class="btn-icon locked-slider-lock" aria-pressed="false">${glyph(
        'unlock'
      )}${glyph('lock')}</button></div>`
    ),
    name = row.querySelector('.locked-slider-name')!,
    lock = row.querySelector('.locked-slider-lock') as HTMLButtonElement;

  // As text: the label is a translation, not markup.
  name.textContent = label;
  row.setAttribute('aria-label', label);
  lock.setAttribute('aria-label', t('LockedSlider.lock-rate', { label }));
  lock.title = t('LockedSlider.lock-title');

  return row;
};

export type onInputHandler = () => void;

export class LockedSlider extends Element {
  #key: string;
  #label: string;
  // The most it may be set to (M2d: Civ2's maximum rates), 100 where there's none.
  #max: number;
  #range: HTMLInputElement;
  #number: HTMLInputElement;
  #lock: HTMLButtonElement;
  #listeners: onInputHandler[] = [];

  constructor(
    key: string,
    currentValue: number,
    label: string,
    max: number = 100,
    // Drawn before the name, such as the rate's yield icon: decorative, as the name says what it is.
    icon: Node | null = null
  ) {
    super(template(label, currentValue));

    if (icon !== null) {
      this.element().querySelector('.locked-slider-icon')!.append(icon);
    }

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
      '.locked-slider-lock'
    ) as HTMLButtonElement;

    // Each named after its rate: the row's name alone leaves a screen reader saying "slider, 50" (#857).
    this.#range.setAttribute('aria-label', label);
    this.#number.setAttribute('aria-label', label);

    this.#showMax();
    this.build();
  }

  // A maximum below 100 is said, and the number box stops at it as the slider does; the track ends at it, so its thumb
  //  at the end is the most the rate can be.
  #showMax(): void {
    const name = this.element().querySelector('.locked-slider-name')!;

    name.querySelector('.locked-slider-max')?.remove();

    if (this.#max >= 100) {
      this.#number.removeAttribute('max');
      this.#range.setAttribute('max', '100');

      return;
    }

    const maximum = document.createElement('small');

    maximum.className = 'locked-slider-max';
    maximum.textContent = t('LockedSlider.max', { max: this.#max });
    this.#number.setAttribute('max', String(this.#max));
    this.#range.setAttribute('max', String(this.#max));
    name.append(' ', maximum);
  }

  /**
   * A new maximum (the government changed while the window is open): said, and the value brought within it, which
   *  rebalances the others as moving it does.
   */
  setMax(max: number): void {
    this.#max = Math.min(Math.max(max, 0), 100);
    this.#showMax();
    this.set(String(this.value()));
  }

  build(): void {
    this.set(this.#range.value);

    this.#range.addEventListener('input', () => this.set(this.#range.value));

    this.#number.addEventListener('input', () => this.set(this.#number.value));

    this.#lock.addEventListener('click', () => this.toggleLock());

    this.lock();
  }

  key(): string {
    return this.#key;
  }

  label(): string {
    return this.#label;
  }

  /** Locks it, or takes the lock off, as its button does. */
  toggleLock(): void {
    this.#lock.setAttribute('aria-pressed', String(!this.isLocked()));
    this.lock();
  }

  private lock(): void {
    this.element().classList.toggle('locked', this.isLocked());

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
    return this.#lock.getAttribute('aria-pressed') === 'true';
  }

  max(): number {
    return this.#max;
  }

  /** Takes the lock off, as when the rates can only come to 100 by moving it. */
  unlock(): void {
    this.#lock.setAttribute('aria-pressed', 'false');
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
    this.#range.style.setProperty(
      '--fill',
      String(this.#max === 0 ? 0 : parseInt(value, 10) / this.#max)
    );

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
