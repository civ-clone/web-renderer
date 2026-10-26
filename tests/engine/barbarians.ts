// The barbarians (#169), in a seeded game driven through a human `DataTransferClient`: civ1-barbarians' sea-landing
//  rule brings the barbarian player into the game at a turn past Emperor's gate, the host gives it a `BarbarianClient`,
//  the client takes a turn (a ship put beside the human's city lands its raiders, who move the turn after), the human
//  is told of a landing and an uprising next to their city (and not of one they can't see), a barbarian leader killed
//  in a stack pays the human a ransom (#171), the barbarians are named but kept out of the intelligence report and the
//  cheat list, and a save names classes a load can resolve.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import {
  Diplomat,
  Horseman,
  Sail,
  Settlers,
  Swordman,
} from '@civ-clone/civ1-unit/Units';
import Defeated from '@civ-clone/core-unit/Rules/Defeated';
import Gold from '@civ-clone/base-city-yield-gold/Gold';
import BarbarianClient from '@civ-clone/simple-ai-client/BarbarianClient';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import { Emperor } from '@civ-clone/civ1-difficulty/Difficulties';
import { FoundCity } from '@civ-clone/library-unit/Actions';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import TurnStart from '@civ-clone/core-player/Rules/TurnStart';
import Unit from '@civ-clone/core-unit/Unit';
import spawnUnits, {
  createUnit,
} from '@civ-clone/civ1-barbarians/lib/spawnUnits';
import { defaultGame, defaultSlots } from '@civ-clone/core-game/defaultGame';
import { gameForLoad } from '@civ-clone/core-save-game/gameForLoad';
import { hydrate } from '@civ-clone/core-save-game/hydrate';
import hasMet from '../../src/js/Engine/lib/hasMet';
import { intelligenceRows } from '../../src/js/Engine/lib/intelligence';
import isBarbarian from '@civ-clone/base-civilization-barbarian/isBarbarian';
import isHuman from '@civ-clone/civ1-difficulty/isHuman';
import { registerBarbarianClasses } from '../../src/js/Engine/barbarians';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';
import { registerDiplomacyClasses } from '../../src/js/Engine/diplomacy';
import { save } from '@civ-clone/core-save-game/save';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as gameDifficultyRegistryInstance } from '@civ-clone/core-difficulty/GameDifficultyRegistry';
import { instance as interactionRegistryInstance } from '@civ-clone/core-diplomacy/InteractionRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

let started = false,
  humanPlayer: Player | null = null,
  helper: SimpleAIClient | null = null,
  handlers: { [channel: string]: (...args: any[]) => unknown } = {},
  sent: { [channel: string]: any[] } = {},
  pendingChoice: ((value: any) => void) | null = null;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL barbarians: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

// Each notification is sent as a transfer object: the notification itself is the one its hierarchy refers to.
const notices = (): any[] =>
  (sent.gameNotification ?? []).map(
    ({ hierarchy, objects }: any) => objects[hierarchy['#ref']]
  );

const run = async (): Promise<void> => {
  gameDifficultyRegistryInstance.set(Emperor);

  // The human founds a city with its Settlers, so there is a city of theirs to raid.
  const settlers = unitRegistryInstance
    .getByPlayer(humanPlayer!)
    .find((unit) => unit instanceof Settlers);

  if (!settlers) {
    fail('the human has no Settlers');
  }

  const foundCity = settlers!
    .actions()
    .find((action) => action instanceof FoundCity);

  if (!foundCity) {
    fail('the Settlers cannot found a city here');
  }

  settlers!.action(foundCity!);

  await settle();

  const [city] = cityRegistryInstance.getByPlayer(humanPlayer!);

  if (!city) {
    fail('the human founded no city');
  }

  // 1. The sea-landing rule, at a turn past Emperor's gate, makes the barbarian player and a ship.
  const before = playerRegistryInstance.length,
    landing = ruleRegistryInstance.getById(
      'civ1-barbarians:turn/start/sea-landing'
    );

  if (!landing) {
    fail('civ1-barbarians is not loaded');
  }

  // Turn 41 plays count 40, so the count just completed is 39: past Emperor's 30, and (39 + 1) % 8 is 0.
  turnInstance.set(41);

  if (!landing!.validate(turnInstance)) {
    fail('the sea-landing rule does not apply on turn 41 of an Emperor game');
  }

  landing!.process(turnInstance);

  await settle();

  const barbarians = playerRegistryInstance.entries().find(isBarbarian);

  if (!barbarians || playerRegistryInstance.length !== before + 1) {
    fail('no barbarian player was made');
  }

  const client = clientRegistryInstance.getByPlayer(barbarians!);

  if (!(client instanceof BarbarianClient)) {
    fail(`the barbarians got a ${client.constructor.name}`);
  }

  if (isHuman(barbarians!, clientRegistryInstance)) {
    fail('the barbarians count as the human');
  }

  const ship = unitRegistryInstance
    .getByPlayer(barbarians!)
    .find((unit) => unit instanceof Sail);

  if (!ship) {
    fail('the barbarians have no ship');
  }

  // 3. The human is told of a landing and an uprising next to their city, which they can see, and not of a landing
  //    where they can't. Emitted by hand, before the barbarians' own turns below: a notice given once the human's turn
  //    has moved on is held for the next hand-over, and this harness never hands over again.
  const seen = city.tile(),
    unseen = seen
      .map()
      .entries()
      .find(
        (tile: Tile) =>
          playerWorldRegistryInstance
            .getByPlayer(humanPlayer!)
            .getByTile(tile) === null
      );

  if (!unseen) {
    fail('the human has seen the whole world');
  }

  engine.emit('barbarians:landed', barbarians, city, seen);
  engine.emit('barbarians:uprising', barbarians, city, seen, false);
  engine.emit('barbarians:uprising', barbarians, city, seen, true);
  engine.emit('barbarians:landed', barbarians, city, unseen);

  // A computer player's city, on a square we can see: their news, not ours.
  const rival = playerRegistryInstance
    .entries()
    .find((player) => player !== humanPlayer && !isBarbarian(player));

  engine.emit(
    'barbarians:landed',
    barbarians,
    { player: () => rival } as unknown as typeof city,
    seen
  );

  // 3b. A barbarian Horseman beaten outside a city takes its stack with it (`civ1-unit`'s destroy-stack), and the
  //     leader in it pays the human 100 gold all the same (#171): the stacked leader is only destroyed, not defeated.
  const stackAt = seen
      .getNeighbours()
      .find(
        (tile: Tile) =>
          tile.isLand() &&
          cityRegistryInstance.getByTile(tile) === null &&
          unitRegistryInstance.getByTile(tile).length === 0
      ),
    treasury = defaultGame.playerTreasuries.getByPlayerAndType(
      humanPlayer!,
      Gold
    ),
    goldBefore = treasury.value();

  if (!stackAt) {
    fail('there is no free land next to the human city');
  }

  const [raider, leader] = spawnUnits(
      barbarians!,
      stackAt!,
      [Horseman, Diplomat],
      ruleRegistryInstance
    ),
    attacker = createUnit(Swordman, humanPlayer!, seen, ruleRegistryInstance);

  ruleRegistryInstance.process(Defeated, raider, attacker, {
    unit: () => attacker,
  } as any);

  await settle();

  if (!leader.destroyed() || !raider.destroyed()) {
    fail('the barbarian stack outlived its defender');
  }

  if (treasury.value() !== goldBefore + 100) {
    fail(
      `the ransom paid ${
        treasury.value() - goldBefore
      }, not 100, for a leader killed in a stack`
    );
  }

  attacker.destroy();

  await settle();

  const told = notices()
      .filter(({ key }: any) => String(key).startsWith('Barbarians.'))
      .map(({ key }: any) => key),
    expected = [
      'Barbarians.landing',
      'Barbarians.uprising',
      'Barbarians.uprising.guerrilla',
      'Barbarians.ransom',
    ];

  if (JSON.stringify(told) !== JSON.stringify(expected)) {
    fail(`the human was told ${JSON.stringify(told)}`);
  }

  // 4. Named, but in neither the intelligence report nor the cheat list.
  if (
    !hasMet(humanPlayer!, barbarians!, {
      interactions: interactionRegistryInstance,
      cities: cityRegistryInstance,
      playerWorlds: playerWorldRegistryInstance,
    })
  ) {
    fail('the barbarians would be an unknown civilization');
  }

  if (
    intelligenceRows(humanPlayer!, () => true).some(
      (row) => row.civilization === 'Barbarian'
    )
  ) {
    fail('the intelligence report lists the barbarians');
  }

  handlers.cheatPlayers?.({});

  await settle();

  const [cheatPlayers] = sent.cheatPlayers ?? [];

  if (
    !cheatPlayers ||
    cheatPlayers.some(
      ({ civilization }: any) => civilization === 'Barbarian'
    ) ||
    cheatPlayers.length !== before
  ) {
    fail(`the cheat list is ${JSON.stringify(cheatPlayers)}`);
  }

  // 2 (after 3 and 4). Their turns: the client plays them through. The rule's ship sails, lands, or stands down. A second ship, put on
  //    the sea beside the human's city with two Swordmen aboard, lands them (`barbarians:landed` for real), and they
  //    move the turn after: raiders landed from a ship used to stay stowed and asleep for good.
  const capital = city.tile(),
    shore = capital
      .map()
      .entries()
      .filter(
        (tile: Tile) =>
          tile.isWater() &&
          tile.distanceFrom(capital) <= 4 &&
          tile
            .getNeighbours()
            .some(
              (neighbour: Tile) =>
                neighbour.isLand() &&
                neighbour !== capital &&
                cityRegistryInstance.getByTile(neighbour) === null &&
                unitRegistryInstance.getByTile(neighbour).length === 0
            )
      )
      .sort(
        (a: Tile, b: Tile) => a.distanceFrom(capital) - b.distanceFrom(capital)
      )[0];

  if (!shore) {
    fail('no sea within 4 of the capital to put a raiding ship on');
  }

  const raidingShip = createUnit(
      Sail as unknown as typeof Unit,
      barbarians!,
      shore!,
      ruleRegistryInstance
    ),
    raiders = spawnUnits(
      barbarians!,
      shore!,
      [Swordman, Swordman],
      ruleRegistryInstance,
      raidingShip as any
    ),
    landings: [Player, unknown, Tile][] = [];

  if (raiders.length !== 2 || raiders.some((unit) => unit.active())) {
    fail('the raiders did not board');
  }

  engine.on('barbarians:landed', (player: Player, near: unknown, tile: Tile) =>
    landings.push([player, near, tile])
  );

  ruleRegistryInstance.process(TurnStart, barbarians!);

  try {
    await client.takeTurn();
  } catch (error) {
    fail('the barbarian client failed its turn', error);
  }

  if (!ship!.destroyed() && ship!.active() && ship!.moves().value() > 0) {
    fail('the ship still has moves and orders to take');
  }

  const [landed] = landings;

  if (!landed || landed[1] !== city || !landed[2].isNeighbourOf(shore!)) {
    fail(
      `the raiders beside the capital did not land: ${JSON.stringify(
        landings.length
      )} landing(s)`
    );
  }

  if (raiders.some((unit) => unit.tile() !== landed[2] || unit.destroyed())) {
    fail('the raiders are not ashore where the landing was told');
  }

  // The turn after: awake, with moves, and off the beach.
  ruleRegistryInstance.process(TurnStart, barbarians!);

  if (raiders.some((unit) => !unit.active() || unit.moves().value() <= 0)) {
    fail('the landed raiders did not wake up the turn after');
  }

  try {
    await client.takeTurn();
  } catch (error) {
    fail("the barbarian client failed the raiders' turn", error);
  }

  if (
    raiders.every(
      (unit) => !unit.destroyed() && unit.tile() === landed[2] && unit.active()
    )
  ) {
    fail('the landed raiders did nothing with their turn');
  }

  // 5. A save names the barbarians' classes and client, and a load target resolves the classes.
  const { plugins } = await import('../../src/js/plugins');

  engine.registerPlugins(plugins);

  const file = save(defaultGame, { name: 'barbarians' }),
    json = JSON.stringify(file);

  if (
    !json.includes('"type":"Barbarian"') ||
    !json.includes('"type":"Attila"') ||
    !file.clients.some(
      ({ module, playerId }) =>
        module === 'BarbarianClient' && playerId === barbarians!.id()
    )
  ) {
    fail('the save does not name the barbarians');
  }

  const target = gameForLoad(defaultSlots);

  registerClasses(target, { collisions: [] });
  registerDiplomacyClasses(target);
  registerBarbarianClasses(target);

  if (!target.classes.get('Barbarian') || !target.classes.get('Attila')) {
    fail('a load could not resolve the barbarians');
  }

  // 6. Hydrated into a load target, the barbarian player is still the barbarians, and its saved client entry names
  //    `BarbarianClient`: what `loadGame`'s `restoreGame` and `Game.ts`'s `#createClient` (which checks `isBarbarian`
  //    before the human flag) go on.
  hydrate(file, target);

  const loaded = target.players.entries().find(isBarbarian);

  if (
    !loaded ||
    loaded.civilization().leader()?.name() !== 'Attila' ||
    target.players.entries().filter(isBarbarian).length !== 1 ||
    !(new BarbarianClient(loaded) instanceof BarbarianClient)
  ) {
    fail('the loaded game has no barbarian player to give a client to');
  }

  console.log(
    `PASS barbarians (player made on turn 41 with a ${
      ship!.constructor.name
    }, played by BarbarianClient; a ship beside the capital landed ${
      raiders.length
    } raiders who moved the turn after; landing, uprising and guerrilla notices; a leader killed in a stack paid 100 ransom; named, unlisted; a rival's landing is not ours; save names Barbarian, Attila and BarbarianClient, and hydrates with the barbarians intact)`
  );

  process.exit(0);
};

const transport = {
  receive: (channel: string, handler: (...args: any[]) => unknown) => {
    handlers[channel] = handler;

    return () => false;
  },
  receiveOnce: (channel: string, handler: (value: any) => void) => {
    if (channel === 'chooseFromList') {
      pendingChoice = handler;
    }

    return () => {
      pendingChoice = null;
    };
  },
  reply: (channel: string, data: any): void => {
    (sent[channel] ??= []).push(JSON.parse(JSON.stringify(data)));
  },
  send: (channel: string, data: any): void => {
    if (channel === 'chooseFromList') {
      const meta = data as ChoiceMeta<any>,
        respond = pendingChoice;

      // `receiveOnce` is registered after the send, so answer on the next tick.
      setTimeout(() =>
        helper!
          .chooseFromList(meta)
          .then((value) => {
            const [choice] = meta
              .choices()
              .filter((choice) => choice.value() === value);

            (pendingChoice ?? respond)!(choice?.id());
          })
          .catch((error) => fail('the helper could not choose', error))
      );

      return;
    }

    if (['cheatPlayers', 'gameNotification'].includes(channel)) {
      (sent[channel] ??= []).push(JSON.parse(JSON.stringify(data)));

      return;
    }

    if (channel === 'turnStarted' && !started) {
      started = true;

      setTimeout(() =>
        run().catch((error) => fail('the test could not be played', error))
      );
    }
  },
};

// Before the handler that creates players: `civ1-player` unregisters a civilization as a player claims it, so the
//  save classes are read first (as `tests/engine/save.ts` and `Game.ts` do).
engine.on('engine:start', (): void => {
  registerClasses(defaultGame, { collisions: [] });
  registerDiplomacyClasses(defaultGame);
  registerBarbarianClasses(defaultGame);
});

engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((_, index): void => {
    const player = new Player();

    playerRegistryInstance.register(player);

    if (index === 0) {
      humanPlayer = player;
      helper = new SimpleAIClient(player);

      clientRegistryInstance.register(
        new DataTransferClient(player, transport as any)
      );

      return;
    }

    clientRegistryInstance.register(new SimpleAIClient(player));
  });
});

engine.setOption('players', config.players);
engine.setOption('height', config.height);
engine.setOption('width', config.width);

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

engine.start();

import('../../src/js/plugins')
  .then(() => engine.emit('plugins:load:end'))
  .catch((error) => fail('failed to load plugins', error));
