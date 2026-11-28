// A player's age, as Civ1's rules send it for the map to draw their cities in (D9), with the plain civ1 set loaded as a
//  game loads it and rules-civ1's AdditionalData registered:
//
// - your own player's `era`: the latest of civ1-enhanced's research tiers they know an advance of, its eight ages
//   folded into six (Electric with Industrial, Space with Modern), with none of civ1-enhanced's rules registered;
// - a rival's stand-in carries `era` too, read as it's sent;
// - an advance raised through the engine that starts a new age sends it again: your own player's `era` key, then your
//   cities' squares, in that order; a rival's cities the player has been sent, with their squares. The first advance
//   after the client starts counts as a new age, as what came before it can't be worked out. An advance in the same
//   age sends nothing more than it did before.

import './lib/seed';
import '@civ-clone/ui-worker-client/Game';
import {
  Alphabet,
  Automobile,
  Banking,
  BronzeWorking,
  CodeOfLaws,
  Electricity,
  Feudalism,
  Pottery,
  Railroad,
  SpaceFlight,
  Writing,
} from '@civ-clone/civ1-science/Advances';
import { Greek, Roman } from '@civ-clone/civ1-civilization/Civilizations';
import {
  knownUnknownCity,
  unknownCityOf,
  unknownPlayerOf,
} from '@civ-clone/ui-worker-client/Client/standIns';
import Added from '@civ-clone/core-player/Rules/Added';
import City from '@civ-clone/core-city/City';
import FillGenerator from '@civ-clone/simple-world-generator/tests/lib/FillGenerator';
import { Grassland } from '@civ-clone/civ1-world/Terrains';
import Player from '@civ-clone/core-player/Player';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import Tile from '@civ-clone/core-world/Tile';
import World from '@civ-clone/core-world/World';
import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import pluginSets from '../../src/js/pluginSets';
import { playerView } from '@civ-clone/ui-worker-client/Client/View';
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';
import { registerPatchEvents } from '@civ-clone/ui-worker-client/Client/events/patchEvents';
import { workerRules } from '@civ-clone/ui-worker-client/workerRules';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL playerEras: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

// The key's value for `object`, as the client's payload would carry it.
const additional = (object: any, key: string): any =>
  additionalDataRegistryInstance
    .getByType(object.sourceClass())
    .find((additionalData) => additionalData.key() === key)
    ?.data(object);

const run = async (): Promise<void> => {
  const world = await new World(
      new FillGenerator(40, 40, Grassland),
      defaultGame.rules,
      defaultGame.landMasses
    ).build(),
    addPlayer = () => {
      const player = new Player(defaultGame.rules);

      defaultGame.players.register(player);
      defaultGame.playerWorlds.register(
        new PlayerWorld(player, world, defaultGame.rules)
      );

      return player;
    },
    us = addPlayer(),
    them = addPlayer(),
    // A third player, with no cities, whose advances walk the tiers.
    walker = addPlayer();

  await pluginsFrom(pluginSets)
    .sets.find(({ id }) => id === 'civ1')!
    .load();
  await import('@civ-clone/ui-rules-civ1');

  // No advances to start with: Civ1 picks them at random, which would start a player in any of the first tiers.
  defaultGame.rules
    .getById('civ1-science:player/added/starting-advances')!
    .disable();

  [us, them, walker].forEach((player, index) => {
    player.setCivilization(index === 0 ? new Roman() : new Greek());
    defaultGame.rules.process(Added, player);
  });

  expect(
    "the plain civ1 set has none of civ1-enhanced's rules, era or not",
    defaultGame.rules
      .entries()
      .filter((rule) => rule.id()?.startsWith('civ1-enhanced:')).length,
    0
  );

  const researchOf = (player: Player) =>
    defaultGame.playerResearch.getByPlayer(player);

  expect(
    'to begin with, every player is ancient',
    [us, them, walker].map((player) => additional(player, 'era')),
    ['ancient', 'ancient', 'ancient']
  );

  // Each tier in turn, by one of its advances: the latest known is the age.
  const walked = [
    Alphabet,
    CodeOfLaws,
    Feudalism,
    Banking,
    Railroad,
    Electricity,
    Automobile,
    SpaceFlight,
  ].map((AdvanceType) => {
    researchOf(walker).addAdvance(AdvanceType);

    return additional(walker, 'era');
  });

  expect(
    "each tier's age, Electric folded into Industrial and Space into Modern",
    walked,
    [
      'ancient',
      'classical',
      'medieval',
      'renaissance',
      'industrial',
      'industrial',
      'modern',
      'modern',
    ]
  );

  expect(
    "the worker rules' era is the AdditionalData's, for anyone",
    [us, walker].map((player) => workerRules().era!(player)),
    ['ancient', 'modern']
  );

  const ours = new City(us, world.get(10, 10), 'Ours', defaultGame.rules),
    theirs = new City(them, world.get(30, 30), 'Theirs', defaultGame.rules),
    // A rival's city the player has never been sent.
    unsent = new City(them, world.get(30, 10), 'Unsent', defaultGame.rules);

  // What the client patches for a rival's city the player has seen.
  defaultGame.playerWorlds
    .getByPlayer(us)
    .register(
      ...world
        .tiles()
        .filter(
          (tile: Tile) =>
            defaultGame.playerWorlds.getByPlayer(us).getByTile(tile) === null
        )
    );

  const view = playerView(() => us, {
      cities: defaultGame.cities,
      interactions: defaultGame.interactions,
      playerWorlds: defaultGame.playerWorlds,
    } as any),
    listeners: { [event: string]: ((...args: any[]) => void)[] } = {},
    patched: string[] = [];

  registerPatchEvents(
    {
      on: (event: string, listener: (...args: any[]) => void) =>
        (listeners[event] = [...(listeners[event] ?? []), listener]),
      off: () => {},
    } as any,
    {
      view,
      cities: defaultGame.cities,
      units: defaultGame.units,
      dataFilter: () => (object: any) => object,
      patches: {
        tile: (tile: any) => tile && patched.push(`tile ${tile.id()}`),
        unit: (unit: any) => patched.push(`unit ${unit.id()}`),
        city: (city: any) => patched.push(`city ${city.name()}`),
        update: (id: string) => patched.push(`update ${id}`),
        playerKey: (key: string) => patched.push(`playerKey ${key}`),
        flush: () => {},
      },
    } as any
  );

  // The engine's own event, as an advance raises it however it's gained (research, a hut, a theft, a parley), passed
  //  to the client's listener: only that one, as the rest are given only what this suite needs.
  defaultGame.engine.on('player:research-complete', (...args: unknown[]) =>
    listeners['player:research-complete']!.forEach((listener) =>
      listener(...args)
    )
  );

  const gain = (player: Player, AdvanceType: any): string[] => {
      patched.length = 0;
      researchOf(player).addAdvance(AdvanceType);

      return [...patched];
    },
    squareOf = (city: City) => `tile ${view.tile(city.tile())!.id()}`,
    research = `update ${researchOf(us).id()}`,
    theirStandIn = unknownPlayerOf(them);

  // Their city is sent, so its stand-in, and their stand-in, are made.
  unknownCityOf(theirs);

  expect(
    "a rival's stand-in carries its age",
    [theirStandIn.keys().includes('era'), theirStandIn.era()],
    [true, 'ancient']
  );

  expect(
    'our first advance after the client starts: our age, then our city, with our research',
    gain(us, Alphabet),
    [research, 'playerKey era', squareOf(ours)]
  );

  expect(
    'our advance in the same age: our research alone',
    gain(us, BronzeWorking),
    [research]
  );

  expect(
    'our advance into a new age: our age, then our city',
    [gain(us, CodeOfLaws), additional(us, 'era')],
    [[research, 'playerKey era', squareOf(ours)], 'classical']
  );

  expect(
    "a rival's first advance: the city we were sent goes again with its square, the one we weren't doesn't",
    gain(them, Alphabet),
    [squareOf(theirs)]
  );

  expect("a rival's advance in the same age: nothing", gain(them, Pottery), []);

  expect(
    "a rival's advance into a new age: its city's square, and its stand-in in it",
    [
      gain(them, Writing),
      theirStandIn.era(),
      (theirStandIn.toPlainObject() as any).objects?.[theirStandIn.id()]?.era ??
        null,
    ],
    [[squareOf(theirs)], 'classical', 'classical']
  );

  expect(
    'the city never sent got no stand-in from it',
    [
      defaultGame.cities.getByPlayer(them).includes(unsent),
      knownUnknownCity(unsent),
    ],
    [true, undefined]
  );

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL playerEras (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS playerEras (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL playerEras: ${error?.stack ?? error}\n`);
  process.exit(1);
});
