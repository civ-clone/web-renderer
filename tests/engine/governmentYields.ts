// What a government does to the squares a city works (#401), as v474.05 has it: under Anarchy and Despotism a square
//  yielding more than 2 of something gives 1 less of it, unless the city is celebrating, and The Republic and Democracy
//  add 1 trade to a square that has any, as do Monarchy and Communism while the city celebrates.
//
// A city on irrigated Grassland with a road (3 food, 1 trade), working only its own square, with civ1-world's tile
//  rules, civ1-city's worked squares and civ1-city-happiness's celebration rule: once with those rules on their own,
//  and once with each package's rules registered into a `Game` as the plugins register them, so the wiring (which
//  registry each rule is given) is checked too.

import {
  Anarchy,
  Communism,
  Democracy,
  Despotism,
  Monarchy,
  Republic,
} from '@civ-clone/civ1-government/Governments';
import { Food, Trade } from '@civ-clone/civ1-world/Yields';
import {
  PendingEffect,
  PendingEffectRegistry,
} from '@civ-clone/core-pending-effect';
import AvailableGovernmentRegistry from '@civ-clone/core-government/AvailableGovernmentRegistry';
import CityGrowthRegistry from '@civ-clone/core-city-growth/CityGrowthRegistry';
import Government from '@civ-clone/core-government/Government';
import { LEADER_CELEBRATION } from '@civ-clone/civ1-city-happiness/lib/cityStatus';
import Player from '@civ-clone/core-player/Player';
import PlayerGovernment from '@civ-clone/core-government/PlayerGovernment';
import PlayerGovernmentRegistry from '@civ-clone/core-government/PlayerGovernmentRegistry';
import PlayerWorldRegistry from '@civ-clone/core-player-world/PlayerWorldRegistry';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import TerrainFeatureRegistry from '@civ-clone/core-terrain-feature/TerrainFeatureRegistry';
import TileImprovementRegistry from '@civ-clone/core-tile-improvement/TileImprovementRegistry';
import WorkedTile from '@civ-clone/core-city/WorkedTile';
import WorkedTileRegistry from '@civ-clone/core-city/WorkedTileRegistry';
import Yield from '@civ-clone/core-yield/Yield';
import celebrationYield from '@civ-clone/civ1-city-happiness/Rules/City/celebration-yield';
import cityYield from '@civ-clone/civ1-city/Rules/City/yield';
import { Game } from '@civ-clone/civ1-game';
import { reduceYield } from '@civ-clone/core-yield/lib/reduceYields';
import { register as registerCity } from '@civ-clone/civ1-city/registerRules';
import { register as registerCityHappiness } from '@civ-clone/civ1-city-happiness/registerRules';
import { register as registerWorld } from '@civ-clone/civ1-world/registerRules';
import setUpCity from '@civ-clone/civ1-city/tests/lib/setUpCity';
import tileYield from '@civ-clone/civ1-world/Rules/Tile/yield';
import tileYieldModifier from '@civ-clone/civ1-world/Rules/Tile/yield-modifier';

// [government, celebrating, food, trade]
const cases: [typeof Government, boolean, number, number][] = [
  [Anarchy, false, 2, 1],
  [Anarchy, true, 3, 1],
  [Despotism, false, 2, 1],
  [Despotism, true, 3, 1],
  [Monarchy, false, 3, 1],
  [Monarchy, true, 3, 2],
  [Communism, true, 3, 2],
  [Republic, false, 3, 2],
  [Republic, true, 3, 2],
  [Democracy, false, 3, 2],
];

const run = async (): Promise<number> => {
  let failures = 0;

  for (const [GovernmentType, celebrating, food, trade] of cases) {
    const ruleRegistry = new RuleRegistry(),
      tileImprovementRegistry = new TileImprovementRegistry(),
      playerGovernmentRegistry = new PlayerGovernmentRegistry(),
      pendingEffects = new PendingEffectRegistry(),
      workedTileRegistry = new WorkedTileRegistry(ruleRegistry),
      player = new Player(ruleRegistry),
      playerGovernment = new PlayerGovernment(
        player,
        new AvailableGovernmentRegistry(),
        ruleRegistry
      );

    playerGovernmentRegistry.register(playerGovernment);
    playerGovernment.set(new GovernmentType());

    ruleRegistry.register(
      ...tileYield(tileImprovementRegistry, new TerrainFeatureRegistry()),
      ...tileYieldModifier(tileImprovementRegistry, playerGovernmentRegistry),
      // Only the worked squares: the city's other yields need more than this sets up.
      ...cityYield().filter(
        (rule) => rule.id() === 'civ1-city:city/yield/worked-tiles'
      ),
      ...celebrationYield(
        pendingEffects,
        playerGovernmentRegistry,
        tileImprovementRegistry
      )
    );

    const city = await setUpCity({
      ruleRegistry,
      player,
      cityGrowthRegistry: new CityGrowthRegistry(),
      playerWorldRegistry: new PlayerWorldRegistry(),
      tileImprovementRegistry,
      workedTileRegistry,
    });

    workedTileRegistry.register(new WorkedTile(city.tile(), city));

    if (celebrating) {
      pendingEffects.register(new PendingEffect(LEADER_CELEBRATION, city));
    }

    const yields: Yield[] = city.yields(),
      actual = [reduceYield(yields, Food), reduceYield(yields, Trade)],
      label = `${GovernmentType.name}${celebrating ? ', celebrating' : ''}`;

    if (actual[0] !== food || actual[1] !== trade) {
      failures++;

      console.error(
        `  FAIL ${label.padEnd(24)} ${actual[0]} food, ${
          actual[1]
        } trade (expected ${food}, ${trade})`
      );

      continue;
    }

    console.log(`  ok   ${label.padEnd(24)} ${food} food, ${trade} trade`);
  }

  return failures;
};

// The same city in a `Game` with civ1-world's, civ1-city's and civ1-city-happiness's rules registered as the plugins
//  register them. The city's other yields need more than this sets up, so only its own square's are counted: the
//  worked square's and the celebration's, which carry the square's id.
const runRegistered = async (): Promise<number> => {
  let failures = 0;

  for (const [GovernmentType, celebrating, food, trade] of cases) {
    const game = new Game();

    registerWorld(game);
    registerCity(game);
    registerCityHappiness(game);

    const player = new Player(game.rules),
      playerGovernment = new PlayerGovernment(
        player,
        game.availableGovernments,
        game.rules
      );

    game.playerGovernments.register(playerGovernment);
    playerGovernment.set(new GovernmentType());

    const city = await setUpCity({
      ruleRegistry: game.rules,
      player,
      cityGrowthRegistry: game.cityGrowth,
      playerWorldRegistry: game.playerWorlds,
      tileImprovementRegistry: game.tileImprovements,
      workedTileRegistry: game.workedTiles,
    });

    if (!game.workedTiles.tileIsWorked(city.tile())) {
      game.workedTiles.register(new WorkedTile(city.tile(), city));
    }

    if (celebrating) {
      game.pendingEffects.register(new PendingEffect(LEADER_CELEBRATION, city));
    }

    const own = (YieldType: typeof Yield): number =>
        city
          .yields()
          .filter(
            (cityYield) =>
              cityYield instanceof YieldType &&
              cityYield
                .values()
                .every(([, provider]) =>
                  provider.startsWith(`${city.tile().id()}: `)
                )
          )
          .reduce((total, cityYield) => total + cityYield.value(), 0),
      actual = [own(Food), own(Trade)],
      label = `${GovernmentType.name}${
        celebrating ? ', celebrating' : ''
      } (registered)`;

    if (actual[0] !== food || actual[1] !== trade) {
      failures++;

      console.error(
        `  FAIL ${label.padEnd(36)} ${actual[0]} food, ${
          actual[1]
        } trade (expected ${food}, ${trade})`
      );

      continue;
    }

    console.log(`  ok   ${label.padEnd(36)} ${food} food, ${trade} trade`);
  }

  return failures;
};

Promise.all([run(), runRegistered()]).then(([own, registered]) => {
  const failures = own + registered;

  if (failures > 0) {
    console.error(`FAIL governmentYields: ${failures} of ${cases.length * 2}`);

    process.exit(1);
  }

  console.log(
    `PASS governmentYields (${cases.length} cases, celebrating or not, with the rules on their own and as the plugins register them)`
  );
});
