import { City, Player } from '../types';
import { Element, s } from '@dom111/element';
import { reduceKnownYields } from '../lib/yieldMap';
import { t } from 'i18next';

export class PlayerDetails extends Element {
  #player: Player;

  constructor(element: HTMLElement, player: Player) {
    super(element);

    this.#player = player;
  }

  build(): void {
    this.empty();

    const { civilization, treasuries, research, cities } = this.#player,
      [goldTreasury] = treasuries.filter(
        (treasury) => treasury.yield._ === 'Gold'
      );

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
        `<h3>${t('PlayerDetails.header', {
          leader: t(`Leader.${civilization.leader._}.name`, {
            defaultValue: civilization.leader._,
            ns: 'civilization',
          }),
          nation: t(`${civilization._}.plural`, {
            defaultValue: civilization._,
            ns: 'civilization',
          }),
        })}</h3>`
      ),
      s(
        `<p><strong>${t('PlayerDetails.Researching.title')}</strong><br/>${t(
          'PlayerDetails.Researching.body',
          {
            progress: research.progress.value,
            cost: research.cost.value,
            perTurn: totalResearch,
            researching: t(`${research.researching?._}.name`, {
              defaultValue: research.researching?._,
              ns: 'science',
            }),
            turns: Number.isFinite(researchTurns) ? researchTurns : 0,
            context: research.researching ? 'researching' : 'notresearching',
          }
        )}</p>`
      ),
      s(
        `<p><strong>${t('PlayerDetails.Treasury.title')}</strong><br/>${t(
          'PlayerDetails.Treasury.body',
          {
            value: goldTreasury.value,
            perTurn: totalGold,
          }
        )}</p>`
      )
    );
  }
}

export default PlayerDetails;
