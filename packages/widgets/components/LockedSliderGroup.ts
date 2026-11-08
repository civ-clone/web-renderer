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

  private rebalance(slider: LockedSlider): void {
    if (this.total() === 100) {
      return;
    }

    const otherSliders = this.#sliders.filter(
        (otherSlider) => otherSlider !== slider
      ),
      otherActiveSliders = otherSliders.filter((slider) => !slider.isLocked());

    if (this.total() !== 100 && otherActiveSliders.length === 0) {
      slider.set((100 - this.total(otherSliders)).toString());

      return;
    }

    if (this.total() > 100) {
      let overage = this.total() - 100,
        chunk = Math.ceil(overage / otherActiveSliders.length);

      otherActiveSliders.forEach((otherSlider) => {
        otherSlider.set(
          (otherSlider.value() - Math.min(chunk, overage)).toString()
        );

        overage -= chunk;
      });

      if (this.total() > 100) {
        slider.set((100 - this.total(otherSliders)).toString());
      }
    }

    if (this.total() < 100) {
      let remaining = 100 - this.total(),
        chunk = Math.ceil(remaining / otherActiveSliders.length);

      otherActiveSliders.forEach((otherSlider) => {
        otherSlider.set(
          (otherSlider.value() + Math.min(chunk, remaining)).toString()
        );

        remaining -= chunk;
      });

      if (this.total() < 100) {
        slider.set((100 - this.total(otherSliders)).toString());
      }
    }
  }

  sliders(): LockedSlider[] {
    return this.#sliders;
  }

  private total(sliders = this.#sliders): number {
    return sliders.reduce((total, slider) => total + slider.value(), 0);
  }
}

export default LockedSliderGroup;
