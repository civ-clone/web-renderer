import { Element, s } from '@dom111/element';
import { GameDifficulty, Yield } from '../types';
import { difficultyName } from '../lib/difficulty';
import { t } from 'i18next';

export class GameDetails extends Element {
  #difficulty: GameDifficulty | null;
  #turn: Yield;
  #year: Yield;

  constructor(
    element: HTMLElement,
    turn: Yield,
    year: Yield,
    difficulty: GameDifficulty | null = null
  ) {
    super(element);

    this.#difficulty = difficulty;
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

    if (this.#difficulty) {
      const difficulty = document.createElement('p');

      difficulty.className = 'difficulty';
      // As text: a level's name is a translation, not markup.
      difficulty.textContent = t('GameDetails.difficulty', {
        difficulty: difficultyName(this.#difficulty.difficulty._),
      });

      this.append(difficulty);
    }
  }

  year(year = this.#year.value): string {
    return t('GameDetails.year', {
      year: Math.abs(year) || 1, // This ensures we show 1 CE, instead of 0 CE
      context: year < 0 ? 'bce' : 'ce',
    });
  }
}

export default GameDetails;
