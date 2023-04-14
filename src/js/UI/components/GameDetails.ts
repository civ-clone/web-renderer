import { Element, s } from '@dom111/element';
import { Yield } from '../types';
import { t } from 'i18next';

export class GameDetails extends Element {
  #turn: Yield;
  #year: Yield;

  constructor(element: HTMLElement, turn: Yield, year: Yield) {
    super(element);

    this.#turn = turn;
    this.#year = year;
  }

  build(): void {
    this.empty();

    this.append(
      s(
        `<h3><span class="year">${this.year()}</span><span class="turn">${t(
          'GameDetails.turn',
          {
            turn: this.#turn.value,
          }
        )}</span></h3>`
      )
    );
  }

  year(year = this.#year.value): string {
    return t('GameDetails.year', {
      year: Math.abs(year) || 1, // This ensures we show 1 CE, instead of 0 CE
      context: year < 0 ? 'bce' : 'ce',
    });
  }
}

export default GameDetails;
