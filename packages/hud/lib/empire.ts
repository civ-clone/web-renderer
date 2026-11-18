import { City, Player } from '@civ-clone/ui-protocol/types';
import isAnarchy from '@civ-clone/ui-client/lib/government';
import { reduceKnownYields } from '@civ-clone/ui-client/lib/yieldMap';
import { turnsLeft } from '@civ-clone/ui-city/components/lib/cityYields';

// Each trade rate's colour in a tax bar (`--panel-*` tokens), in Civ1's order, whatever order they arrive in: the top
//  bar's and the trade rates window's alike.
export const rateClasses: { [key: string]: string } = {
  Tax: 'tax',
  Luxuries: 'luxury',
  Research: 'science',
};

const rateOrder = Object.keys(rateClasses);

export const ratePosition = (rate: string): number =>
  rateOrder.includes(rate) ? rateOrder.indexOf(rate) : rateOrder.length;

// The yield icon for each rate, where it isn't the rate's own name.
export const rateIcons: { [key: string]: string } = {
  Tax: 'Gold',
};

export type EmpireTotals = {
  anarchy: boolean;
  // Cities that would riot as things stand.
  disorder: number;
  gold: number;
  research: number;
  // The `PlayerDetails.Researching.detail` context: researching or not, and in Anarchy or not.
  researchContext: string;
  researchTurns: number;
};

/**
 * What the empire's cities give a turn, from their yields as the engine sends them (#274): the gold and research, the
 *  turns to the next advance, and how many cities would riot. The top bar shows them, and the trade rates window shows
 *  them changing as the rates do (#1058).
 */
export const empireTotals = (player: Player): EmpireTotals => {
  const { cities, research } = player,
    [gold, research_] = cities.reduce(
      ([gold, research], city: City): [number, number] => {
        const [cityGold, cityResearch] = reduceKnownYields(
          city.yields,
          'Gold',
          'Research'
        );

        return [gold + cityGold, research + cityResearch];
      },
      [0, 0]
    ),
    anarchy = isAnarchy(player);

  return {
    anarchy,
    disorder: cities.filter((city) => city.civilDisorder).length,
    gold,
    research: research_,
    researchContext: `${research.researching ? '' : 'not'}researching${
      anarchy ? '-anarchy' : ''
    }`,
    // As the Science report counts it: done this turn when progress already covers the cost (#704).
    researchTurns: turnsLeft(
      research,
      cities.flatMap((city) => city.yields),
      'Research'
    ),
  };
};
