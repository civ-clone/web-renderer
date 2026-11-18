import LockedSlider from './LockedSlider';

export class LockedSliderGroup {
  #sliders;
  #rebalancing = false;

  constructor(...sliders: LockedSlider[]) {
    this.#sliders = sliders;

    this.#sliders.forEach((slider) =>
      slider.onInput(() => {
        // Moving the other sliders fires their listeners too: only the slider the player moved rebalances, or the
        //  nested rebalances move it away from the value they chose (#485).
        if (this.#rebalancing) {
          return;
        }

        this.#rebalancing = true;
        this.rebalance(slider);
        this.#rebalancing = false;
      })
    );
  }

  // Shared within each slider's bounds, with or without maximums: the even split this replaced took the others' share
  //  from one already at 0 too, and gave what it couldn't take back to the slider moved, so moving tax to 70 from 40,
  //  with luxuries at 0, stopped it at 55 (#1058).
  private rebalance(slider: LockedSlider): void {
    if (this.total() === 100) {
      return;
    }

    this.rebalanceWithin(slider);
  }

  // The difference from 100 shared between the other unlocked sliders, each within 0 and its maximum (100 without one); what they can't
  //  take goes back to the slider moved, and failing that (the others locked, or at their bounds), to the locked ones,
  //  so the rates always come to 100.
  private rebalanceWithin(slider: LockedSlider): void {
    const others = this.#sliders.filter((other) => other !== slider);

    this.spread(
      others.filter((other) => !other.isLocked()),
      100 - this.total()
    );

    if (this.total() !== 100) {
      this.spread([slider], 100 - this.total());
    }

    // A locked slider that has to move is unlocked, so what the window shows is what it holds.
    if (this.total() !== 100) {
      const locked = others.filter((other) => other.isLocked()),
        before = locked.map((other) => other.value());

      this.spread(locked, 100 - this.total());

      locked
        .filter((other, index) => other.value() !== before[index])
        .forEach((other) => other.unlock());
    }
  }

  // Adds `amount` (or takes it, if it's negative) across `sliders` in equal shares, each within its bounds.
  private spread(sliders: LockedSlider[], amount: number): void {
    let remaining = amount;

    while (remaining !== 0) {
      const room = sliders.filter((each) =>
        remaining > 0 ? each.value() < each.max() : each.value() > 0
      );

      if (room.length === 0) {
        return;
      }

      const chunk = Math.ceil(Math.abs(remaining) / room.length);

      room.forEach((each) => {
        if (remaining === 0) {
          return;
        }

        const before = each.value();

        each.set(
          String(
            before + Math.sign(remaining) * Math.min(chunk, Math.abs(remaining))
          )
        );
        remaining -= each.value() - before;
      });
    }
  }

  /**
   * Sets each slider named in `values` to its value as it stands, without rebalancing the others: the rates as the
   *  engine holds them, which already come to 100 (#1169).
   */
  setValues(values: [string, number][]): void {
    this.#rebalancing = true;

    try {
      values.forEach(([key, value]) =>
        this.#sliders.find((slider) => slider.key() === key)?.set(String(value))
      );
    } finally {
      this.#rebalancing = false;
    }
  }

  /** Whether the rates come to 100, as the engine needs them to. */
  balanced(): boolean {
    return this.total() === 100;
  }

  sliders(): LockedSlider[] {
    return this.#sliders;
  }

  private total(sliders = this.#sliders): number {
    return sliders.reduce((total, slider) => total + slider.value(), 0);
  }
}

export default LockedSliderGroup;
