// A city on Auto chooses its own improvements (#194).
//
// Drives a seeded game with a human `DataTransferClient` over a stub transport. A `SimpleAIClient` for the same player
// plays the first turn, so the human has a city, and the player is given the advances for a Temple and a Granary. Then
// the test sends the actions the production picker sends and checks what the city builds, and that the UI is told the
// city is on Auto.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import { config } from './lib/seed';
import './lib/spawnedClients';

import { CeremonialBurial, Pottery } from '@civ-clone/civ1-science/Advances';
import BuildItem from '@civ-clone/core-city-build/BuildItem';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import City from '@civ-clone/core-city/City';
import CityBuild from '@civ-clone/core-city-build/CityBuild';
import DataTransferClient from '../../src/js/Engine/DataTransferClient';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as cityBuildRegistryInstance } from '@civ-clone/core-city-build/CityBuildRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';

let started = false,
  humanPlayer: Player | null = null,
  helper: SimpleAIClient | null = null,
  actionHandler: ((action: any) => void) | null = null,
  pendingChoice: ((value: any) => void) | null = null,
  patches: any[] = [];

const checks: string[] = [];

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `FAIL autoProduction: ${reason}\n${
      error instanceof Error ? error.stack : String(error ?? '')
    }\n`
  );
  process.exit(1);

  throw new Error(reason);
};

const pass = (check: string): void => {
  checks.push(check);
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const transport = {
  receive: (channel: string, handler: (...args: any[]) => void) => {
    if (channel === 'action') {
      actionHandler = handler;
    }

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

    if (channel === 'gameDataPatch') {
      patches.push(JSON.parse(JSON.stringify(data)));
    }

    if (channel === 'turnStarted' && !started) {
      started = true;

      setTimeout(() => run().catch((error) => fail('the test threw', error)));
    }
  },
};

// Every `CityBuild` the patches since the last action sent, by id.
const sentCityBuilds = (): Map<string, any> => {
  const found = new Map<string, any>(),
    visit = (value: any): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);

        return;
      }

      if (value === null || typeof value !== 'object') {
        return;
      }

      if (value._ === 'CityBuild' && typeof value.id === 'string') {
        found.set(value.id, value);
      }

      Object.values(value).forEach(visit);
    };

  visit(patches);

  return found;
};

// Sends what the production picker sends, as `CityBuild` while the city builds nothing, `ChangeProduction` otherwise.
const send = async (cityBuild: CityBuild, payload: object): Promise<void> => {
  patches = [];

  actionHandler!({
    name: cityBuild.building() === null ? 'CityBuild' : 'ChangeProduction',
    id: cityBuild.id(),
    ...payload,
  });

  // `handleAction` is asynchronous and the emitter does not hand its promise back.
  await wait(100);
};

const isUnit = (buildItem: BuildItem | null): boolean =>
  buildItem !== null &&
  Object.prototype.isPrototypeOf.call(Unit, buildItem.item());

const finish = (cityBuild: CityBuild): void => {
  cityBuild.progress().set(cityBuild.cost().value());
  cityBuild.check();
};

const run = async (): Promise<void> => {
  await wait(20);
  await helper!.takeTurn();
  await wait(50);

  const [city]: City[] = cityRegistryInstance.getByPlayer(humanPlayer!);

  if (!city) {
    fail('the human player has no city after the first turn');
  }

  const cityBuild = cityBuildRegistryInstance.getByCity(city);

  // At the start a player knows nothing that unlocks an improvement Auto would build, so the city would be left for
  //  its player. A Temple and a Granary give it something.
  [CeremonialBurial, Pottery].forEach((Advance) =>
    playerResearchRegistryInstance.getByPlayer(humanPlayer!).addAdvance(Advance)
  );

  if (cityBuild.auto()) {
    fail('a new city is on Auto');
  }

  // Off Auto, a finished build leaves the city for its player.
  if (cityBuild.building() === null) {
    cityBuild.build(cityBuild.available()[0].item());
  }

  finish(cityBuild);

  if (cityBuild.building() !== null) {
    fail('a city not on Auto chose its next build by itself');
  }

  pass('off Auto, a finished build leaves the city for its player');

  // Auto, with nothing being built: it starts an improvement straight away and the UI hears of it.
  await send(cityBuild, { auto: true });

  const started = cityBuild.building();

  if (!cityBuild.auto()) {
    fail('the Auto action did not put the city on Auto');
  }

  if (started === null || isUnit(started)) {
    fail(
      `a city put on Auto with nothing to build started ${
        started?.item().name ?? 'nothing'
      }, not an improvement`
    );
  }

  if (sentCityBuilds().get(cityBuild.id())?.auto !== true) {
    fail(
      "the patch after the Auto action did not tell the UI the city's on Auto"
    );
  }

  pass(`Auto started ${started!.item().name} and the UI was told`);

  // Finishing it, the city goes straight on to its next improvement.
  finish(cityBuild);

  const next = cityBuild.building();

  if (next === null || isUnit(next)) {
    fail(
      `a city on Auto followed a finished build with ${
        next?.item().name ?? 'nothing'
      }, not an improvement`
    );
  }

  pass(`a finished build was followed by ${next!.item().name}`);

  // Stopping Auto keeps the build.
  await send(cityBuild, { auto: false });

  if (cityBuild.auto() || cityBuild.building() !== next) {
    fail('stopping Auto did not leave the build as it was');
  }

  if (sentCityBuilds().get(cityBuild.id())?.auto !== false) {
    fail('the patch after stopping Auto did not tell the UI');
  }

  pass('stopping Auto kept the build');

  // Choosing a build by hand takes the city off Auto.
  await send(cityBuild, { auto: true });

  const chosen = cityBuild
    .available()
    .find((buildItem) => buildItem.item() !== next!.item())!;

  await send(cityBuild, { chosen: chosen.item().name });

  if (cityBuild.auto() || cityBuild.building()?.item() !== chosen.item()) {
    fail(
      'choosing a build by hand did not start it and take the city off Auto'
    );
  }

  pass('choosing by hand took the city off Auto');

  // It's saved: `_auto` is one of the fields a save holds.
  cityBuild.setAuto(true);

  if (!cityBuild.stateKeys().includes('_auto')) {
    fail("a city's Auto isn't among the fields a save holds");
  }

  pass('Auto is saved');

  console.log(`PASS autoProduction (${checks.join('; ')})`);

  process.exit(0);
};

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
