import { e, t } from '../lib/html';
import { City, Player, Yield } from '../types';
import Element from './Element';
import { knownGroupLookup } from '../lib/yieldMap';

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
        ([totalGold, totalResearch], city: City) =>
          city.yields.reduce(
            ([totalGold, totalResearch], cityYield: Yield) => {
              if (cityYield._ === 'Research') {
                return [totalGold, totalResearch + cityYield.value];
              }

              if (knownGroupLookup.Gold.includes(cityYield._)) {
                return [totalGold + cityYield.value, totalResearch];
              }

              return [totalGold, totalResearch];
            },
            [totalGold, totalResearch]
          ),
        [0, 0]
      ),
      researchTurns = Math.ceil(
        (research.cost.value - research.progress.value) / totalResearch
      );

    this.element().append(
      e('h3', t(`${civilization.leader.name} of the ${civilization._} empire`)),
      e(
        'p',
        e('strong', t('Researching')),
        e('br'),
        t(
          research.researching
            ? `${research.researching._} ${research.progress.value} / ${
                research.cost.value
              } (${researchTurns} turn${researchTurns === 1 ? '' : 's'})`
            : 'Nothing'
        )
      ),
      e(
        'p',
        e('strong', t('Treasury')),
        e('br'),
        t(`${treasury.value} (${totalGold} / turn)`)
      )
    );
  }
}

export default PlayerDetails;
