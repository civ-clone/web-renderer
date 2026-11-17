// Civ2's Diplomats, Spies and Caravans in the client (M2d part 2, #1007), with the civ2 set loaded as a game loads it,
//  rules-civ2 registered, and a person playing (a `Client`, not a computer player's):
//
// - what a person's Spy may aim a theft or a sabotage at (`targets`), and what a Diplomat may (nothing), and the choice
//   reaching the action through the client's `ActiveUnit` handler;
// - what each mission would do to a treaty (`consequence`): nothing at war, `incident-if-lost` for the Sneak rows,
//   `treaty-ends` for inciting at the plain price under a treaty, and `treaty-kept` for the doubled price;
// - the victim's answer to an espionage incident under a treaty (`incidentOffer`): asked, then war, the end of an
//   alliance, or nothing, and let pass while automation plays;
// - a delivery's goods kept both ways, sent with the city's routes, and forgotten with a destroyed city;
// - the notices: each of the new events, which side is told, and the words.

import './lib/seed';
import '@civ-clone/ui-worker-client/Game';
import {
  Aztec,
  Babylonian,
  Roman,
} from '@civ-clone/civ2-civilization/Civilizations';
import { Caravan, Diplomat, Spy } from '@civ-clone/civ2-unit/Units';
import {
  TreatyLevel,
  treatyLevel,
} from '@civ-clone/base-diplomacy/lib/treatyLevel';
import {
  makeAlliance,
  makePeace,
} from '@civ-clone/base-diplomacy/lib/declareWar';
import i18next, { t } from 'i18next';
import Action from '@civ-clone/core-unit/Action';
import {
  Fundamentalism,
  Republic,
} from '@civ-clone/civ2-government/Governments';
import PlantNuclearDevice from '@civ-clone/base-unit-action-plant-nuclear-device/PlantNuclearDevice';
import { consequenceOf } from '@civ-clone/ui-rules-civ2/AdditionalData/missions';
import { incidentOfferDeclined } from '@civ-clone/civ2-diplomacy/lib/espionage';
import { routeGoodsListener } from '@civ-clone/ui-rules-civ2/lib/routeGoods';
import Added from '@civ-clone/core-player/Rules/Added';
import { Barracks } from '@civ-clone/civ2-city-improvement/CityImprovements';
import City from '@civ-clone/core-city/City';
import Civilization from '@civ-clone/core-civilization/Civilization';
import CityBuild from '@civ-clone/core-city-build/CityBuild';
import CityGrowth from '@civ-clone/core-city-growth/CityGrowth';
import CityImprovement from '@civ-clone/core-city-improvement/CityImprovement';
import Client from '@civ-clone/core-client/Client';
import FillGenerator from '@civ-clone/simple-world-generator/tests/lib/FillGenerator';
import { Grassland } from '@civ-clone/civ2-world/Terrains';
import ActionsState from '@civ-clone/ui-worker-client/Client/ActionsState';
import { NotificationContext } from '@civ-clone/ui-worker-client/Client/notifications/NotificationContext';
import Player from '@civ-clone/core-player/Player';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import World from '@civ-clone/core-world/World';
import { Writing } from '@civ-clone/civ2-science/Advances';
import addFormatters from '@civ-clone/ui-game/app/i18nFormatters';
import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';
import { currentWorkerRules } from '@civ-clone/ui-worker-client/workerRules';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import dependenciesOf from '@civ-clone/civ2-diplomacy/lib/dependenciesOf';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import espionageNotices from '@civ-clone/ui-rules-civ2/espionageNotices';
import { espionageIncident } from '@civ-clone/civ2-diplomacy/lib/espionage';
import { ChoiceMeta } from '@civ-clone/core-client/ChoiceMeta';
import { handleActiveUnit } from '@civ-clone/ui-worker-client/Client/actions/unit';
import { makeDataFilter } from '@civ-clone/ui-worker-client/Client/visibilityFilter';
import { playerView } from '@civ-clone/ui-worker-client/Client/View';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import makeContact from '@civ-clone/base-diplomacy-interaction-contact/makeContact';
import pluginSets from '../../src/js/pluginSets';
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';
import registerIncidentOffers from '@civ-clone/ui-worker-client/Client/incidentOffers';
import { routeGoods } from '@civ-clone/ui-rules-civ2/lib/routeGoods';
import { stubView } from './lib/view';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

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
    process.stderr.write('FAIL civ2Espionage: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

// The key's value for `object`, as the client's payload would carry it.
const additional = (object: any, key: string): unknown =>
  additionalDataRegistryInstance
    .getByType(object.sourceClass())
    .find((additionalData) => additionalData.key() === key)
    ?.data(object);

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  addFormatters(i18next);
  await import('../ui/lib/strings');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ2-civilization/en');
  await import('../../translations/civ2-city/en');
  await import('../../translations/civ2-diplomacy/en');
  await import('../../translations/civ2-unit/en');

  const world = await new World(
      new FillGenerator(60, 40, Grassland),
      defaultGame.rules,
      defaultGame.landMasses
    ).build(),
    addPlayer = (): Player => {
      const player = new Player(defaultGame.rules);

      defaultGame.players.register(player);
      defaultGame.playerWorlds.register(
        new PlayerWorld(player, world, defaultGame.rules)
      );

      return player;
    },
    us = addPlayer(),
    them = addPlayer();

  // Built before the rules are in, as `civ2Units`' are.
  const addCity = (player: Player, tile: Tile, name: string): City => {
      const city = new City(player, tile, name, defaultGame.rules);

      defaultGame.cities.register(city);
      defaultGame.cityGrowth.register(new CityGrowth(city, defaultGame.rules));
      defaultGame.cityBuilds.register(
        new CityBuild(
          city,
          defaultGame.availableCityBuildItems,
          defaultGame.rules
        )
      );

      return city;
    },
    rome = addCity(us, world.get(10, 10), 'Rome'),
    babylon = addCity(them, world.get(30, 10), 'Babylon');

  // Poisoning needs a city of size 2 or more, for a person's Spy: grown before the rules are in, which would want its
  //  squares worked.
  defaultGame.cityGrowth.getByCity(babylon).grow();

  await pluginsFrom(pluginSets)
    .sets.find(({ id }) => id === 'civ2')!
    .load();
  await import('@civ-clone/ui-rules-civ2');

  [us, them].forEach((player, index) => {
    player.setCivilization([new Roman(), new Babylonian()][index]!);

    if (defaultGame.playerResearch.getBy('player', player).length === 0) {
      defaultGame.rules.process(Added, player);
    }
  });

  // A person plays `us`: the missions and the incident offer are a person's.
  defaultGame.clients.register(
    Object.assign(Object.create(Client.prototype), { player: () => us })
  );

  const beside = world.get(29, 10),
    deps = dependenciesOf(defaultGame),
    fullMoves = <T extends Unit>(unit: T): T => {
      unit.moves().set(unit.movement().value());

      return unit;
    },
    named = (action: Action): string => action.sourceClass().name,
    missionsOf = (unit: Unit): Action[] =>
      unit
        .actions(babylon.tile())
        .filter((action: Action) => named(action) !== 'Move');

  defaultGame.cityImprovements.register(
    new Barracks(babylon, defaultGame.rules)
  );
  defaultGame.playerResearch.getByPlayer(them).addAdvance(Writing);
  makeContact(
    defaultGame.interactions,
    us,
    them,
    defaultGame.rules,
    defaultGame.turn
  );

  // What a Spy may aim at, and what a mission does to a treaty.

  const spy = fullMoves(new Spy(rome, us, beside, defaultGame.rules)),
    diplomat = fullMoves(new Diplomat(rome, us, beside, defaultGame.rules)),
    byName = (unit: Unit, name: string): Action | undefined =>
      missionsOf(unit).find((action) => named(action) === name);

  expect(
    'at no treaty, a person’s Spy may steal Writing (which they know and we don’t) or sabotage the Barracks or the production',
    [
      (
        additional(byName(spy, 'StealTechnology'), 'targets') as string[]
      ).includes('Writing'),
      additional(byName(spy, 'IndustrialSabotage'), 'targets'),
    ],
    [true, ['Barracks', 'production']]
  );
  expect(
    'a Diplomat chooses nothing',
    [
      additional(byName(diplomat, 'StealTechnology'), 'targets'),
      additional(byName(diplomat, 'IndustrialSabotage'), 'targets'),
    ],
    [[], []]
  );
  expect(
    'and with no treaty, no mission says what it does to one',
    missionsOf(spy)
      .map((action) => additional(action, 'consequence'))
      .filter((consequence) => consequence !== undefined),
    missionsOf(spy)
      .filter((action) => additional(action, 'consequence') !== undefined)
      .map(() => null)
  );

  makePeace(deps, us, them);

  const atPeace = Object.fromEntries(
    missionsOf(spy).map((action) => [
      named(action),
      additional(action, 'consequence') ?? null,
    ])
  );

  expect(
    'at peace, the missions a person is warned of first are the Sneak rows, and inciting says what it costs the treaty',
    [
      atPeace.SneakStealTechnology,
      atPeace.SneakIndustrialSabotage,
      atPeace.SneakPoisonWater,
      atPeace.InciteRevolt,
      atPeace.SubvertCity,
      atPeace.EstablishEmbassy,
    ],
    [
      'incident-if-lost',
      'incident-if-lost',
      'incident-if-lost',
      'treaty-ends',
      'treaty-kept',
      undefined,
    ]
  );
  {
    const atPeaceDiplomat = Object.fromEntries(
        missionsOf(diplomat).map((action) => [
          named(action),
          additional(action, 'consequence') ?? null,
        ])
      ),
      scandal = () =>
        additional(byName(spy, 'SneakStealTechnology'), 'scandal'),
      playerGovernment = defaultGame.playerGovernments.getByPlayer(us),
      before = playerGovernment.current()!,
      device = new PlantNuclearDevice(
        beside,
        babylon.tile(),
        spy,
        babylon,
        defaultGame.rules
      ),
      deviceConsequence = () => consequenceOf(device);

    const underDespotism = [scandal(), deviceConsequence()];

    playerGovernment.set(new Republic());

    const underRepublic = [scandal(), deviceConsequence()];

    playerGovernment.set(new Fundamentalism());

    const underFundamentalism = [scandal(), deviceConsequence()];

    playerGovernment.set(before);

    expect(
      'a Diplomat is always lost, so its Sneak rows make an incident certain',
      [
        atPeaceDiplomat.SneakStealTechnology,
        atPeaceDiplomat.SneakIndustrialSabotage,
      ],
      ['incident-certain', 'incident-certain']
    );
    expect(
      'a Senate may fall over it under the Republic, not Despotism; a planted device may be found out, but never a Fundamentalist’s',
      [underDespotism, underRepublic, underFundamentalism],
      [
        [false, 'device-may-be-found'],
        [true, 'device-may-be-found'],
        [false, null],
      ]
    );
  }
  expect(
    'the Sneak rows are offered the same targets',
    [
      (
        additional(byName(spy, 'SneakStealTechnology'), 'targets') as string[]
      ).includes('Writing'),
      additional(byName(spy, 'SneakIndustrialSabotage'), 'targets'),
    ],
    [true, ['Barracks', 'production']]
  );

  // Our map: the whole world, as `civ2Units`' is.
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

  // As the client sends them, through its filter: the Spy's actions with their targets and consequence, the city's
  //  the incident offer's civilization. (A city's own payload isn't sent here: this test's cities are made without their
  //  squares, which a city's data reads; its routes' goods are its `tradeRoutes` AdditionalData, read below.)
  const view = playerView(() => us, {
      cities: defaultGame.cities,
      interactions: defaultGame.interactions,
      playerWorlds: defaultGame.playerWorlds,
    } as any),
    actionsState = new ActionsState(),
    // Our player and every civilization as names: what they hold isn't what this is about, and a civilization's
    //  title wants the whole game's players. Other players go as the client's stand-ins, as they always do.
    filter = makeDataFilter(
      () => view,
      actionsState
    )((object: any) =>
      object instanceof Player
        ? { _: 'Player' }
        : object instanceof Civilization
        ? { _: typeNameOf(object.sourceClass()) }
        : object
    ),
    sentObjects = (object: any): any[] =>
      Object.values((object.toPlainObject(filter) as any).objects);

  {
    // Homeless: this test's cities are made without their squares, which a city's own data reads.
    const sender = fullMoves(new Spy(null, us, beside, defaultGame.rules));

    actionsState.setUnitWithActions(sender, () => {});

    const sent = sentObjects(sender),
      theft = sent.find((object) => object._ === 'SneakStealTechnology'),
      incite = sent.find((object) => object._ === 'InciteRevolt');

    expect(
      'the Spy goes to the page with its actions’ targets and what each does to the treaty',
      [
        theft?.targets?.includes('Writing'),
        theft?.consequence,
        incite?.consequence,
      ],
      [true, 'incident-if-lost', 'treaty-ends']
    );
  }

  // The choice through the client: a sabotage aimed at the production takes it, never the Barracks (which a random
  //  sabotage of this city, with nothing else to take, would), or the Spy is caught first. Spies are sent until one
  //  gets through.
  {
    const lost: unknown[][] = [],
      sabotaged: unknown[][] = [],
      onLost = (...args: unknown[]) => lost.push(args),
      onSabotaged = (...args: unknown[]) => sabotaged.push(args);

    engine.on('civ2:agent-lost', onLost);
    engine.on('city:sabotaged', onSabotaged);

    for (let attempt = 0; attempt < 6 && sabotaged.length === 0; attempt++) {
      // At peace again, should a lost Spy's incident have ended it.
      makePeace(deps, us, them);

      const saboteur = fullMoves(new Spy(rome, us, beside, defaultGame.rules));

      await handleActiveUnit(
        {
          view: {
            world: () => [
              { id: () => babylon.tile().id(), tile: () => babylon.tile() },
            ],
          },
          actions: new ActionsState(),
          patches: { unit: () => {}, city: () => {}, onTiles: () => {} },
          talks: {
            pending: Promise.resolve(),
            talkToPlayersMet: async () => {},
          },
        } as any,
        {
          unitAction: 'SneakIndustrialSabotage',
          target: babylon.tile().id(),
          choice: 'production',
        } as any,
        { value: () => saboteur } as any
      );
    }

    engine.off('civ2:agent-lost', onLost);
    engine.off('city:sabotaged', onSabotaged);

    const barracksStanding = defaultGame.cityImprovements
      .getByCity(babylon)
      .some(
        (improvement) =>
          improvement instanceof Barracks && !improvement.destroyed()
      );

    expect(
      'a sabotage aimed at the production takes the production, not the Barracks; each Spy that didn’t get through was caught first',
      [
        sabotaged.length,
        sabotaged.every(([, , target]) => !(target instanceof CityImprovement)),
        barracksStanding,
        lost.filter(([, , , caught]) => caught === true).length >=
          lost.length - sabotaged.length,
      ],
      [1, true, true, true]
    );
  }

  // The victim's answer to an incident under a treaty.
  {
    const offer = currentWorkerRules()!.incidentOffer!,
      asked: string[] = [],
      answer = { value: true as boolean },
      automation = { enabled: false },
      dispose = registerIncidentOffers(engine, {
        view: stubView(() => us),
        automation,
        patches: { player: () => {}, flush: () => {} },
        choose: async (meta: any) => {
          asked.push(meta.key());

          return answer.value;
        },
      } as any),
      settle = () => new Promise((resolve) => setTimeout(resolve, 0)),
      incident = () => espionageIncident(deps, them, us, () => 0.5, { engine });

    // A sabotage may have ended the peace (a lost agent's incident): at peace again.
    makePeace(deps, us, them);

    expect(
      'the civ2 rules offer the victim an answer',
      offer.event,
      'civ2-diplomacy:espionage-incident'
    );

    answer.value = false;

    const passed = incident();

    await settle();

    expect(
      'at peace, an incident against us is offered: let it pass, the peace holds',
      [passed, asked, treatyLevel(deps, us, them)],
      ['offered', ['diplomacy.incident-offer'], TreatyLevel.Peace]
    );

    answer.value = true;
    incident();
    await settle();

    expect(
      'taken: war',
      [asked.slice(-1), treatyLevel(deps, us, them)],
      [['diplomacy.incident-offer'], TreatyLevel.War]
    );

    makeAlliance(deps, us, them);
    incident();
    await settle();

    expect(
      'allied, the offer is the end of the alliance, which leaves the peace',
      [asked.slice(-1), treatyLevel(deps, us, them)],
      [['diplomacy.incident-offer-alliance'], TreatyLevel.Peace]
    );

    // An offer the same move answers (a city incited at the plain price: the war follows at once) isn't asked; nor is
    //  a second one for the pair while the first is.
    makePeace(deps, us, them);
    asked.length = 0;
    incident();
    incidentOfferDeclined(deps, them, us);
    await settle();

    const answeredAtOnce = [...asked];

    answer.value = false;
    incident();
    incident();
    await settle();

    expect(
      'an offer answered in the same move isn’t asked; two in a row are asked once',
      [answeredAtOnce, asked],
      [[], ['diplomacy.incident-offer']]
    );

    automation.enabled = true;
    asked.length = 0;
    incident();
    await settle();

    expect(
      'while automation plays, nothing is asked and the peace holds',
      [asked, treatyLevel(deps, us, them)],
      [[], TreatyLevel.Peace]
    );

    // The offer as the prompt sends it: the other civilization by name.
    {
      const unfiltered = filter,
        meta = new ChoiceMeta([false, true], 'diplomacy.incident-offer', {
          player: them,
        } as any),
        { objects, hierarchy } = meta.toPlainObject(unfiltered) as any,
        resolve = (value: any): any =>
          value && value['#ref'] ? objects[value['#ref']] : value,
        data = resolve(
          resolve(hierarchy).data ?? objects[hierarchy['#ref']]?.data
        ),
        player = resolve(data?.player),
        civilization = resolve(player?.civilization);

      expect(
        'the incident offer goes to the page naming the other civilization',
        civilization?._,
        'Babylonian'
      );
    }

    dispose();
  }

  // A delivery's goods.
  {
    const caravan = fullMoves(new Caravan(rome, us, beside, defaultGame.rules)),
      delivered: unknown[][] = [],
      listener = (...args: unknown[]) => delivered.push(args),
      [route] = missionsOf(caravan).filter(
        (action) => named(action) === 'EstablishTradeRoute'
      );

    engine.on('unit:trade-route-established', listener);
    route!.perform();
    engine.off('unit:trade-route-established', listener);

    const [[, , , goods]] = delivered as [unknown, unknown, unknown, string][],
      sent = (city: City) =>
        (
          additional(city, 'tradeRoutes') as { goods?: string; name: string }[]
        ).map(({ goods, name }) => [name, goods]);

    expect(
      'a delivery’s goods are kept both ways, and sent with each city’s routes',
      [
        typeof goods,
        routeGoods(rome, babylon) === goods,
        routeGoods(babylon, rome) === goods,
        sent(rome),
        sent(babylon),
      ],
      ['string', true, true, [['Babylon', goods]], [['Rome', goods]]]
    );

    // A second delivery to the same partner keeps the goods that set the route up; a partner a city no longer has a
    //  route to (one a full city replaced) is forgotten at its next delivery.
    routeGoodsListener()(us, rome, babylon, 'Uranium');

    const keptFirst = [routeGoods(rome, babylon), routeGoods(babylon, rome)];

    defaultGame.tradeRoutes
      .getByCity(rome)
      .forEach((route) => defaultGame.tradeRoutes.unregister(route));
    routeGoodsListener()(us, rome, babylon, 'Uranium');

    expect(
      'a repeat delivery keeps the first goods; a route that is gone keeps none',
      [keptFirst, routeGoods(rome, babylon), routeGoods(babylon, rome)],
      [[goods, goods], null, goods]
    );

    engine.emit('city:destroyed', babylon, them);

    expect(
      'and forgotten with a destroyed city, both ways',
      [routeGoods(rome, babylon), routeGoods(babylon, rome)],
      [null, null]
    );
  }

  // The notices.
  {
    const ctx = {
        player: () => us,
        view: stubView(() => us),
        hasMet: (other: Player) => other === them,
      } as unknown as NotificationContext,
      stranger = new Player(defaultGame.rules),
      // One we haven't met: never named.
      _named = stranger.setCivilization(new Aztec()),
      table = espionageNotices(),
      // As the page has the data: a city by its name and founder, a player by its civilization, a unit type by name.
      asSent = (value: any): any =>
        value instanceof City
          ? {
              name: value.name(),
              originalPlayer: asSent(value.originalPlayer()),
            }
          : value instanceof Player
          ? {
              civilization: {
                _: typeNameOf(value.civilization().sourceClass()),
              },
            }
          : value,
      told = (event: string, ...args: any[]): string | null => {
        const [, handler] = table.find(([name]) => name === event)!,
          notification = handler(ctx, ...args) as any;

        if (notification === null) {
          return null;
        }

        const data = Object.fromEntries(
          Object.entries(notification.data()).map(([key, value]) => [
            key,
            asSent(value),
          ])
        );

        return `${t(`${notification.key()}.title`, {
          ...data,
          ns: 'notification',
        })}: ${t(`${notification.key()}.body`, {
          ...data,
          ns: 'notification',
          skipOnVariables: false,
        })}`;
      },
      ourSpy = new Spy(rome, us, beside, defaultGame.rules),
      ourDiplomat = new Diplomat(rome, us, beside, defaultGame.rules),
      theirSpy = new Spy(null, them, world.get(11, 10), defaultGame.rules),
      steal =
        byName(spy, 'StealTechnology') ?? byName(spy, 'SneakStealTechnology'),
      embassy = byName(spy, 'EstablishEmbassy')!;

    expect(
      'water poisoned, an agent caught or lost, a device set off: who is told, and the words',
      [
        told('city:water-poisoned', babylon, us),
        told('city:water-poisoned', rome, them),
        told('city:water-poisoned', rome, stranger),
        told('civ2:agent-lost', ourSpy, babylon, steal, true),
        told('civ2:agent-lost', ourSpy, null, steal, true),
        told('civ2:agent-lost', ourSpy, babylon, steal, false),
        told('civ2:agent-lost', ourDiplomat, babylon, steal, false),
        told('civ2:agent-lost', theirSpy, rome, steal, true),
        told('civ2:agent-lost', theirSpy, rome, steal, false),
        told('civ2:agent-lost', ourSpy, null, steal, false),
        told('civ2:device-planted', ourSpy, babylon),
        told('civ2:device-planted', theirSpy, rome),
        told('unit:nuclear-detonation', theirSpy, rome.tile()),
        told('unit:nuclear-detonation', ourSpy, babylon.tile()),
      ],
      [
        'Water poisoned: Our Spy has poisoned the water supply of Babylon.',
        'Water poisoned!: The Babylonians have poisoned the water supply of Rome, and its people sicken.',
        'Water poisoned!: Someone has poisoned the water supply of Rome, and its people sicken.',
        'Agent caught: Our Spy was caught in Babylon.',
        'Agent caught: Our Spy was caught before it could act.',
        'Agent lost: Our Spy did not make it back from Babylon.',
        null,
        'Agent caught: Our guards have caught a Spy sent by the Babylonians in Rome.',
        null,
        'Agent lost: Our Spy did not make it back from its mission.',
        'Nuclear device: The nuclear device our Spy planted has gone off in Babylon.',
        null,
        'Nuclear attack!: A nuclear device planted by a Spy has gone off. Who sent the Spy is not known.',
        null,
      ]
    );
    expect(
      'a device found out: told to its planter; the others are told of the war (`civ2:war-on`), once',
      [
        told('civ2-diplomacy:nuclear-device-discovered', us, [them]),
        told('civ2-diplomacy:nuclear-device-discovered', them, [us]),
      ],
      [
        'Plot uncovered!: The world has learned that our Spy planted a nuclear device. Every civilization in contact with us has declared war on us.',
        null,
      ]
    );
    expect(
      'each incident’s outcome, to whichever side is ours; not a war or the end of an alliance, which tell themselves; none at war, and the offer is asked, not told',
      [
        ...['attitude', 'terror', 'war', 'alliance-cancelled', 'wimp-out'].map(
          (outcome) =>
            told('civ2-diplomacy:espionage-incident', us, them, outcome)
        ),
        told('civ2-diplomacy:espionage-incident', them, us, 'terror'),
        told('civ2-diplomacy:espionage-incident', us, them, 'none'),
        told('civ2-diplomacy:espionage-incident', them, us, 'offered'),
      ],
      [
        'Incident: Our agent’s work has angered the Babylonians. They think less of us now.',
        'Incident: The Babylonians call our agent’s work terror, and swear revenge.',
        null,
        null,
        'Incident: Our allies the Babylonians resent our agent’s theft, though the alliance holds.',
        'Incident: Agents of the Babylonians have struck at us. We will not forget it.',
        null,
        null,
      ]
    );
    expect(
      'a Senate scandal, and a delivery with its research',
      [
        told('civ2-government:senate-scandal', us, them),
        told('civ2-government:senate-scandal', them, us),
        told('unit:trade-route-established', us, rome, babylon, 'Hides', 90),
        told('unit:trade-route-established', them, babylon, rome, 'Hides', 90),
      ],
      [
        'Scandal!: Our dealings with the Babylonians have caused a scandal. The Senate has brought the government down, and we have fallen into Anarchy.',
        null,
        'Trade route established: Our traders from Rome have sold their Leather in Babylon, earning 90 gold and as much again in research.',
        null,
      ]
    );
    expect(
      'an agent used up by an embassy isn’t news',
      told('civ2:agent-lost', ourSpy, babylon, embassy, false),
      null
    );
  }

  finished = true;
};

run().then(
  () => {
    if (failures.length > 0) {
      process.stderr.write(
        `FAIL civ2Espionage (${
          failures.length
        } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
      );
      process.exit(1);
    }

    process.stdout.write(`PASS civ2Espionage (${checks} checks)\n`);
    process.exit(0);
  },
  (error) => {
    process.stderr.write(`FAIL civ2Espionage: ${error?.stack ?? error}\n`);
    process.exit(1);
  }
);
