// What the UI asks the worker for (#449), moved out of `DataTransferClient`: the Top Cities and intelligence reports,
//  the Civilization Score, what a city can build and a unit's actions, each answered on the channel it was asked on.
//  The client's `topCities`, `civilizationScore` and `cityBuildAvailable` are these, for the tests that call them.

import Player from '@civ-clone/core-player/Player';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import { CityBuildRegistry } from '@civ-clone/core-city-build/CityBuildRegistry';
import { CityGrowthRegistry } from '@civ-clone/core-city-growth/CityGrowthRegistry';
import { CityRegistry } from '@civ-clone/core-city/CityRegistry';
import { GameResultRegistry } from '@civ-clone/core-turn-based-game/GameResultRegistry';
import { ObjectMap } from '@civ-clone/core-data-object/DataObject';
import { PlayerWorldRegistry } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';
import { SpecialistRegistry } from '@civ-clone/core-city/SpecialistRegistry';
import { UnitRegistry } from '@civ-clone/core-unit/UnitRegistry';
import { WonderRegistry } from '@civ-clone/core-wonder/WonderRegistry';
import Transport, { TransportDisposer } from '../Transport';
import {
  TopCitiesRow,
  defaultTopCitiesLimit,
  topCitiesEntries,
  topCitiesRows,
} from '../lib/topCities';
import {
  CivilizationScore,
  civilizationScore as civilizationScoreOf,
} from '../lib/civilizationScore';
import ActionsState from './ActionsState';
import PlayerPatches from './PlayerPatches';
import { DataFilter, serialiseUnit } from './visibilityFilter';
import { intelligenceRows } from '../lib/intelligence';
import { standalone } from './refs';

export type RequestsContext = {
  player(): Player;
  // Whether we have met a player, which says what the reports may show of them.
  hasMet(player: Player): boolean;
  // What the player may see, which a city's build list and a unit's actions go through.
  dataFilter: DataFilter;
  // The unit the UI has the actions of (#323), which `unitActions` changes.
  actions: ActionsState;
  patches: PlayerPatches;
  cities: Pick<CityRegistry, 'entries'>;
  cityBuilds: Pick<CityBuildRegistry, 'getBy'>;
  cityGrowths: Pick<CityGrowthRegistry, 'getByCity'>;
  gameResults: GameResultRegistry;
  playerWorlds: PlayerWorldRegistry;
  rules: RuleRegistry;
  specialists: SpecialistRegistry;
  units: Pick<UnitRegistry, 'getBy'>;
  wonders: Pick<WonderRegistry, 'getByCity'>;
};

export const topCities = (
  ctx: RequestsContext,
  limit: number = defaultTopCitiesLimit
): TopCitiesRow[] =>
  topCitiesRows(
    topCitiesEntries(ctx.player(), {
      cities: ctx.cities,
      cityGrowths: ctx.cityGrowths,
      specialists: ctx.specialists,
      wonders: ctx.wonders,
      playerWorlds: ctx.playerWorlds,
      hasMet: (player: Player) => ctx.hasMet(player),
    }),
    Number.isInteger(limit) && limit > 0 ? limit : defaultTopCitiesLimit
  );

export const civilizationScore = (ctx: RequestsContext): CivilizationScore =>
  civilizationScoreOf(ctx.player(), {
    gameResults: ctx.gameResults,
    playerWorlds: ctx.playerWorlds,
    rules: ctx.rules,
  });

export const cityBuildAvailable = (
  dataFilter: DataFilter,
  cityBuild: CityBuildItem
): ObjectMap => {
  const available = cityBuild.available(),
    filter = dataFilter(standalone);

  // `toPlainObject` is a method on `DataObject`, and it is the only way in: the filter is applied to what it is called
  //  on first, so handing it the list in place of the build gets the list serialised, as the `hierarchy`.
  return cityBuild.toPlainObject((object: any) =>
    object === cityBuild ? available : filter(object)
  );
};

export const registerRequests = (
  transport: Transport<TransportDataMap>,
  ctx: RequestsContext
): TransportDisposer => {
  const disposers: TransportDisposer[] = [];

  // Worked out here and sent as finished rows, so the UI learns nothing about rival cities beyond what the report
  //  shows (#124).
  disposers.push(
    transport.receive('topCities', (limit) =>
      transport.send('topCities', topCities(ctx, limit))
    )
  );

  // The engine's `Score` rules add it up (#149).
  disposers.push(
    transport.receive('civilizationScore', () =>
      transport.send('civilizationScore', civilizationScore(ctx))
    )
  );

  // What a city can build, for the production picker (#324). Standalone, as a notification is, so the picker's list
  //  resolves on its own and brings nothing of the game with it. A build that is not ours has nothing to show.
  disposers.push(
    transport.receive('cityBuildAvailable', (cityBuildId) => {
      const [cityBuild] = ctx.cityBuilds.getBy('id', cityBuildId);

      transport.send(
        'cityBuildAvailable',
        cityBuild && cityBuild.city().player() === ctx.player()
          ? cityBuildAvailable(ctx.dataFilter, cityBuild)
          : { hierarchy: [], objects: {} }
      );
    })
  );

  // The UI makes a unit active and asks for its actions, which the patches leave out for every other unit (#323). The
  //  answer is a patch of that unit alone, with its tiles as refs the UI already holds.
  disposers.push(
    transport.receive('unitActions', (unitId) => {
      const [unit] = ctx.units.getBy('id', unitId);

      if (!unit || unit.player() !== ctx.player()) {
        return;
      }

      // When the UI had another unit's actions, that unit goes again without them.
      ctx.actions.setUnitWithActions(unit, (previous) =>
        ctx.patches.unit(previous)
      );

      ctx.patches.update(unit.id(), () => {
        ctx.actions.answering = unit;

        try {
          return serialiseUnit(ctx.dataFilter, unit);
        } finally {
          ctx.actions.answering = null;
        }
      });

      ctx.patches.flush();
    })
  );

  // The intelligence report (F3, #58), worked out here for the same reason as the Top Cities.
  disposers.push(
    transport.receive('intelligence', () =>
      transport.send(
        'intelligence',
        intelligenceRows(ctx.player(), (player) => ctx.hasMet(player))
      )
    )
  );

  return () => disposers.forEach((dispose) => dispose());
};

export default registerRequests;
