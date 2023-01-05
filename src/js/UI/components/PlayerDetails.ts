import { City, Player } from '../types';
import { Element, s } from '@dom111/element';
import { reduceKnownYields } from '../lib/yieldMap';
import civilizationAttribute from './lib/civilizationAttribute';

export class PlayerDetails extends Element {
  #player: Player;

  constructor(element: HTMLElement, player: Player) {
    super(element);

    this.#player = player;
  }

  build(): void {
    this.empty();

    const { civilization, treasury, research, cities } = this.#player;

    const [totalGold, totalResearch] = cities.reduce(
        ([totalGold, totalResearch], city: City): [number, number] => {
          // TODO: There must be a way to specify that the return array has the same number of elements as the arguments...
          const [cityGold, cityResearch] = reduceKnownYields(
            city.yields,
            'Gold',
            'Research'
          );

          return [totalGold + cityGold, totalResearch + cityResearch];
        },
        [0, 0]
      ),
      researchTurns = Math.ceil(
        (research.cost.value - research.progress.value) / totalResearch
      );

    this.append(
      s(
        `<h3>${civilization.leader.name} of the ${civilizationAttribute(
          civilization,
          'people'
        )} empire</h3>`
      ),
      s(
        `<p><strong>Researching</strong><br/>${
          research.researching
            ? `${research.researching._} ${research.progress.value} / ${
                research.cost.value
              } (${totalResearch} / turn - ${researchTurns} turn${
                researchTurns === 1 ? '' : 's'
              })`
            : `Nothing (${totalResearch} / turn)`
        }</p>`
      ),
      s(
        `<p><strong>Treasury</strong><br/>${treasury.value} (${totalGold} / turn)</p>`
      )
    );
  }
}

export default PlayerDetails;
