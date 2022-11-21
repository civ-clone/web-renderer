import { Element, s } from '@dom111/element';
import { Unit } from '../types';

export class UnitDetails extends Element {
  #activeUnit: Unit | null;

  constructor(element: HTMLElement, activeUnit: Unit | null) {
    super(element);

    this.#activeUnit = activeUnit;

    this.build();
  }

  build(): void {
    this.empty();

    if (this.#activeUnit === null) {
      return;
    }

    this.append(
      s(
        `<p>${this.#activeUnit._} (${this.#activeUnit.tile.x}, ${
          this.#activeUnit.tile.y
        })</p>`
      ),
      s(`<p>${this.#activeUnit.city?.name ?? 'NONE'}</p>`),
      s(
        `<p>${
          Number.isInteger(this.#activeUnit.moves.value)
            ? this.#activeUnit.moves.value
            : this.#activeUnit.moves.value.toFixed(2)
        } / ${this.#activeUnit.movement.value} moves</p>`
      ),
      s(
        `<p>A: ${this.#activeUnit.attack.value} / D: ${
          this.#activeUnit.defence.value
        } / V: ${this.#activeUnit.visibility.value}</p>`
      ),
      s(
        `<p>${this.#activeUnit.improvements
          .map((improvement) => improvement._)
          .join(', ')}</p>`
      ),
      s(
        `<p>${this.#activeUnit.tile.terrain._}${
          this.#activeUnit.tile.terrain.features
            ? ' ' +
              this.#activeUnit.tile.terrain.features
                .map((feature) => feature._)
                .join(', ')
            : ''
        }${
          this.#activeUnit.tile.improvements.length
            ? ' (' +
              this.#activeUnit.tile.improvements
                .map((improvement) => improvement._)
                .join(', ') +
              ')'
            : ''
        }</p>`
      ),
      s(
        `<p>${this.#activeUnit.tile.units
          .filter((unit) => unit !== this.#activeUnit)
          .map((unit) => unit._)
          .join(', ')}</p>`
      )
    );
  }
}

export default UnitDetails;
