import { Element, s } from '@dom111/element';
import { Yield } from '../types';

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
        `<h3><span class="year">${this.year()}</span><span class="turn">${this.#turn.value.toString()}</span></h3>`
      )
    );
  }

  year(year = this.#year.value): string {
    if (year < 0) {
      return Math.abs(year) + ' BCE';
    }

    if (year === 0) {
      return '1 CE';
    }

    return year + ' CE';
  }
}

export default GameDetails;
