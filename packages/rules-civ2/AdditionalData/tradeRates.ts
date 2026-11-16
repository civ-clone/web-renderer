import {
  PlayerGovernmentRegistry,
  instance as playerGovernmentRegistryInstance,
} from '@civ-clone/core-government/PlayerGovernmentRegistry';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import Fundamentalism from '@civ-clone/base-government-fundamentalism/Fundamentalism';
import PlayerTradeRates from '@civ-clone/core-trade-rate/PlayerTradeRates';
import ResearchRate from '@civ-clone/base-trade-rate-research/Research';
import TradeRate from '@civ-clone/core-trade-rate/TradeRate';
import cosmic from '@civ-clone/civ2-rules/data/cosmic';
import governedBy from '@civ-clone/base-government-change/lib/governedBy';

// A rate's maximum is a fraction, and 0.7 × 100 is 70.00000000000001: as a whole percentage.
const percent = (fraction: number): number =>
  Math.round(Math.round(fraction * 1e6) / 1e4);

/**
 * The most a player may put into each of their rates (M2d, #1007): civ2-trade-rate's `MaxRate` rules, through
 *  core-trade-rate's `maxRates()`, as whole percentages by the rate's name, for the rates dialog to stop its sliders
 *  at. A rate with no maximum isn't listed. Civ1's rules have none, and send none.
 */
export const maxRates = (): AdditionalData =>
  new AdditionalData(
    PlayerTradeRates,
    'maxRates',
    (playerTradeRates: PlayerTradeRates): { [rate: string]: number } =>
      Object.fromEntries(
        playerTradeRates
          .maxRates()
          .filter(
            (entry): entry is [TradeRate, number] => entry[1] !== undefined
          )
          .map(([rate, maximum]) => [rate.sourceClass().name, percent(maximum)])
      )
  );

/**
 * Where a rate is worth less than it's set to, as a whole percentage by the rate's name: under Fundamentalism, research
 *  gets no more than COSMIC's 5 tenths of a city's trade when it's split, and tax the rest (civ2-science), so the
 *  research rate may stand above it. The rates dialog says so. None under any other government.
 */
export const limitedRates = (
  playerGovernments: PlayerGovernmentRegistry = playerGovernmentRegistryInstance
): AdditionalData =>
  new AdditionalData(
    PlayerTradeRates,
    'limitedRates',
    (playerTradeRates: PlayerTradeRates): { [rate: string]: number } => {
      try {
        return governedBy(
          playerTradeRates.player(),
          [Fundamentalism],
          playerGovernments
        )
          ? { [ResearchRate.name]: cosmic.fundamentalismMaxScience * 10 }
          : {};
      } catch (e) {
        // A player with no government yet.
        return {};
      }
    }
  );
