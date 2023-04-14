import { Element, s } from '@dom111/element';
import { t } from 'i18next';
import { Unit as UnitData } from '../types';
import { cityName } from './lib/city';
import Unit from './Unit';

export class UnitDetails extends Element {
  #activeUnit: UnitData | null;

  constructor(element: HTMLElement, activeUnit: UnitData | null) {
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
        `<p>${t('UnitDetails.header', {
          unitName: t(`${this.#activeUnit._}.name`, {
            defaultValue: this.#activeUnit._,
            ns: 'unit',
          }),
          x: this.#activeUnit.tile.x,
          y: this.#activeUnit.tile.y,
        })}</p>`
      ),
      s(`<p>${cityName(this.#activeUnit.city)}</p>`),
      s(
        `<p>${t('UnitDetails.moves', {
          remaining: this.#activeUnit.moves.value,
          total: this.#activeUnit.movement.value,
        })}</p>`
      ),
      s(
        `<p>${t('UnitDetails.stats', {
          attack: this.#activeUnit.attack.value,
          defence: this.#activeUnit.defence.value,
          visibility: this.#activeUnit.visibility.value,
        })}</p>`
      ),
      s(
        `<p>${t('UnitDetails.improvements', {
          improvements: this.#activeUnit.improvements.map((improvement) =>
            t(`Improvement.${improvement._}.name`, {
              defaultValue: improvement._,
              ns: 'unit',
            })
          ),
        })}</p>`
      ),
      s(
        `<p>${t('UnitDetails.terrain', {
          terrain: t(`${this.#activeUnit.tile.terrain._}.name`, {
            defaultValue: this.#activeUnit.tile.terrain._,
            ns: 'world',
          }),
          features: this.#activeUnit.tile.terrain.features.map((feature) =>
            t(`Feature.${feature._}.name`, {
              defaultValue: feature._,
              ns: 'world',
            })
          ),
          improvements: this.#activeUnit.tile.improvements.map((improvement) =>
            t(`Improvement.${improvement._}.name`, {
              defaultValue: improvement._,
              ns: 'world',
            })
          ),
        })}</p>`
      ),
      // TODO: These could be clickable?
      s(
        `<p></p>`,
        ...this.#activeUnit.tile.units
          .filter((unit) => unit !== this.#activeUnit)
          .map((unit) => new Unit(unit))
      )
    );
  }
}

export default UnitDetails;
