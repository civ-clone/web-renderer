// Talks under Civ2's rules (M2d, #1007), through the client's own `Talks` with the civ2 set loaded and a computer player
//  answering as it does in a game (simple-ai-client): talks the person opens from the Foreign Advisor (`OpenTalks`), led
//  by the person, whose menu is civ2-diplomacy's at each treaty level (`diplo_proposal_menu`), with the favours and the
//  gifts among it; maps shared; a gift of gold given; and an audience a computer player asks for
//  (`civ2-diplomacy:audience-due`), held at the next hand-over, led by the computer player.

// Must stay first: seeds `Math.random` before any engine module evaluates.
import './lib/seed';
import '@civ-clone/ui-worker-client/Game';
import {
  Aztec,
  Babylonian,
  Celtic,
  Chinese,
  Egyptian,
  Greek,
  Roman,
  Zulu,
} from '@civ-clone/civ2-civilization/Civilizations';
import {
  AGGRESSOR,
  AGGRESSOR_LONG,
  CHANGED_THIS_TURN,
  HOSTILE_INTENT,
  WAR_THIS_TURN,
  clearBoth,
} from '@civ-clone/civ2-diplomacy/lib/flags';
import Civilization from '@civ-clone/core-civilization/Civilization';
import {
  cancelAlliance,
  declareWar,
  makeAlliance,
  makeCeasefire,
  makePeace,
} from '@civ-clone/base-diplomacy/lib/declareWar';
import Added from '@civ-clone/core-player/Rules/Added';
import Client from '@civ-clone/core-client/Client';
import FillGenerator from '@civ-clone/simple-world-generator/tests/lib/FillGenerator';
import { Gold } from '@civ-clone/library-city/Yields';
import { Grassland } from '@civ-clone/civ2-world/Terrains';
import { MapMaking } from '@civ-clone/civ2-science/Advances';
import Negotiation from '@civ-clone/core-diplomacy/Negotiation';
import Player from '@civ-clone/core-player/Player';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Talks, {
  TalksContext,
  registerTalkEvents,
} from '@civ-clone/ui-worker-client/Client/Talks';
import Terminate from '@civ-clone/core-diplomacy/Negotiation/Terminate';
import TurnStart from '@civ-clone/core-player/Rules/TurnStart';
import World from '@civ-clone/core-world/World';
import { attitude } from '@civ-clone/civ2-diplomacy/lib/relations';
import { currentWorkerRules } from '@civ-clone/ui-worker-client/workerRules';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import handleOpenTalks from '@civ-clone/ui-worker-client/Client/actions/talks';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import makeContact from '@civ-clone/base-diplomacy-interaction-contact/makeContact';
import { patience } from '@civ-clone/base-diplomacy/lib/patience';
import pluginSets from '../../src/js/pluginSets';
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';
import { stubView } from './lib/view';
import { talksGroup } from '@civ-clone/ui-client/lib/talksMenu';

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
    process.stderr.write('FAIL civ2Talks: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

// The class names the UI keys a choice on, as `instanceOf` reads them from a choice sent (`__`).
const inheritance = (object: object): string[] => {
  const names: string[] = [];

  for (
    let prototype = Object.getPrototypeOf(object);
    prototype !== null && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    names.push(prototype.constructor.name);
  }

  return names;
};

const run = async (): Promise<void> => {
  const world = await new World(
      new FillGenerator(30, 30, Grassland),
      defaultGame.rules,
      defaultGame.landMasses
    ).build(),
    add = (): Player => {
      const player = new Player(defaultGame.rules);

      defaultGame.players.register(player);
      defaultGame.playerWorlds.register(
        new PlayerWorld(player, world, defaultGame.rules)
      );

      return player;
    },
    us = add(),
    them = add(),
    third = add();

  await pluginsFrom(pluginSets)
    .sets.find(({ id }) => id === 'civ2')!
    .load();

  [us, them, third].forEach((player, index) => {
    player.setCivilization([new Roman(), new Greek(), new Zulu()][index]!);
    defaultGame.rules.process(Added, player);
  });

  expect(
    'the civ2 set’s worker rules let a person open talks and name the audience event',
    [
      typeof currentWorkerRules()?.mayOpenTalks,
      currentWorkerRules()?.audienceEvents,
    ],
    ['function', ['civ2-diplomacy:audience-due']]
  );

  // The person: proposes `target` once, if the menu offers it, and leaves; turns down what the computer player asks.
  let target: ((step: any) => boolean) | null = null;
  const menus: string[][] = [],
    said: string[] = [],
    person = Object.assign(Object.create(Client.prototype), {
      player: () => us,
      chooseFromList: async (meta: any) => {
        const choices = meta.choices().map((choice: any) => choice.value());

        if (meta.key() !== 'negotiation.next-step') {
          said.push(`list ${meta.key()}`);

          return choices[0];
        }

        const leave = choices.find((step: any) => step instanceof Terminate);

        // The menu: the step that offers leaving, with the proposals.
        if (leave !== undefined && choices.length > 1) {
          menus.push(choices.map((step: any) => step.constructor.name));

          const proposal = target === null ? undefined : choices.find(target);

          target = null;

          const step = proposal ?? leave;

          said.push(step.constructor.name);

          return step;
        }

        // An answer: what costs nothing is first (#674), so the last, a refusal, keeps the treaty where it is.
        const step = choices[choices.length - 1];

        said.push(`answer ${step.constructor.name}`);

        return step;
      },
    }),
    computers = new Map<Player, SimpleAIClient>(
      [them, third].map((player) => [player, new SimpleAIClient(player)])
    ),
    clientOf = (player: Player) =>
      player === us ? person : computers.get(player)!;

  defaultGame.clients.register(person, ...computers.values());

  // Another computer player to talk to, in contact with the person.
  const computerPlayer = (CivilizationType: new () => Civilization): Player => {
    const player = add();

    player.setCivilization(new CivilizationType());

    // Added once the rules are in, as a player joining a game is.
    if (defaultGame.playerResearch.getBy('player', player).length === 0) {
      defaultGame.rules.process(Added, player);
    }

    computers.set(player, new SimpleAIClient(player));
    defaultGame.clients.register(computers.get(player)!);
    makeContact(
      defaultGame.interactions,
      us,
      player,
      defaultGame.rules,
      defaultGame.turn
    );

    return player;
  };

  const dependencies: any = {
      clientRegistry: defaultGame.clients,
      interactionRegistry: defaultGame.interactions,
      ruleRegistry: defaultGame.rules,
      turn: defaultGame.turn,
    },
    negotiations: Negotiation[] = [],
    talks = new Talks({
      player: () => us,
      clients: { getByPlayer: clientOf },
      interactions: {
        register: (...interactions: any[]) => {
          negotiations.push(
            ...interactions.filter(
              (interaction) => interaction instanceof Negotiation
            )
          );

          return defaultGame.interactions.register(...interactions);
        },
        getByPlayers: (...players: Player[]) =>
          defaultGame.interactions.getByPlayers(...players),
      },
      patches: {
        playerState: () => null,
        playerStateChanged: () => {},
        flush: () => {},
      },
      rules: defaultGame.rules,
      transport: { send: () => {} },
      turn: defaultGame.turn,
      units: { getByTile: () => [] },
    } as unknown as TalksContext),
    actionContext: any = {
      player: () => us,
      players: defaultGame.players,
      hasMet: (player: Player) => player !== us,
      interactions: defaultGame.interactions,
      rules: defaultGame.rules,
      turn: defaultGame.turn,
      talks,
    },
    // A fresh turn, as a person comes back to talk: the turn-start rules, patience spent on neither side, and a warm
    //  computer player, so the menu and the answers aren't cut short by the last meeting.
    freshTurn = (computer: Player = them, feeling: number = 20): void => {
      defaultGame.turn.set(defaultGame.turn.value() + 3);
      defaultGame.rules.process(TurnStart, computer);
      defaultGame.rules.process(TurnStart, us);
      // As civ2-diplomacy's own signing leaves them: a treaty made or a war declared here goes straight to
      //  base-diplomacy, which leaves the original's marks of who started a war (`diplo_ai_meet_player` ends a meeting
      //  with an aggressor at once).
      clearBoth(
        dependencies,
        us,
        computer,
        AGGRESSOR |
          AGGRESSOR_LONG |
          WAR_THIS_TURN |
          HOSTILE_INTENT |
          CHANGED_THIS_TURN
      );
      patience(dependencies, computer, us).reset();
      patience(dependencies, us, computer).reset();
      attitude(dependencies).set(computer, us, feeling);
    },
    openTalks = async (computer: Player = them): Promise<Negotiation> => {
      menus.length = 0;
      said.length = 0;

      await handleOpenTalks(actionContext, {
        civilization: computer.civilization().sourceClass().name,
      });

      return negotiations[negotiations.length - 1]!;
    };

  expect(
    'without contact, a person may not open talks',
    [
      currentWorkerRules()!.mayOpenTalks!(us, them, dependencies),
      await handleOpenTalks(actionContext, { civilization: 'Greek' }),
      negotiations.length,
    ],
    [false, false, 0]
  );

  makeContact(
    defaultGame.interactions,
    us,
    them,
    defaultGame.rules,
    defaultGame.turn
  );
  makeContact(
    defaultGame.interactions,
    us,
    third,
    defaultGame.rules,
    defaultGame.turn
  );

  expect(
    'in contact, a person may open talks with a computer player, but a computer player not with a person, nor a person with itself',
    [
      currentWorkerRules()!.mayOpenTalks!(us, them, dependencies),
      currentWorkerRules()!.mayOpenTalks!(them, us, dependencies),
      currentWorkerRules()!.mayOpenTalks!(us, us, dependencies),
    ],
    [true, false, false]
  );

  // The menu at each treaty level: civ2-diplomacy's `diplo_proposal_menu`.
  const firstLevel = (menu: string[]): string[] =>
      menu.filter(
        (name) =>
          !['ExchangeKnowledge', 'JoinWar', 'ShareMaps', 'Gift'].includes(name)
      ),
    levels: [string, new () => Civilization, (computer: Player) => void][] = [
      ['contact', Babylonian, () => {}],
      ['war', Egyptian, (computer) => declareWar(dependencies, us, computer)],
      [
        'ceasefire',
        Aztec,
        (computer) => makeCeasefire(dependencies, us, computer),
      ],
      ['peace', Chinese, (computer) => makePeace(dependencies, us, computer)],
      [
        'alliance',
        Celtic,
        (computer) => makeAlliance(dependencies, us, computer),
      ],
    ],
    menuAt: { [level: string]: string[] } = {},
    computerAt: { [level: string]: Player } = {},
    stepName = (step: any): string =>
      `${step.constructor.name}${
        typeof step.proposal === 'function'
          ? `(${step.proposal().constructor.name})`
          : ''
      }:${step.by() === us ? 'P' : 'C'}`;

  let warSteps: string[] = [];
  const // Neither warm nor cold, so the computer player has nothing of its own to raise but at war.
    feeling = 50;

  for (const [level, CivilizationType, setUp] of levels) {
    const computer = computerPlayer(CivilizationType);

    computerAt[level] = computer;

    setUp(computer);
    freshTurn(computer, feeling);

    const negotiation = await openTalks(computer);

    menuAt[level] = menus[0] ?? [];

    if (level === 'war') {
      warSteps = negotiation.interactions().map(stepName);
    }

    expect(
      `at ${level}, the talks the person opens are led by the person, and end`,
      [negotiation.initiator() === us, negotiation.terminated()],
      [true, true]
    );
  }

  expect(
    'the menu’s first level at each treaty level, as the original’s: peace offered without a peace, an alliance at peace, tribute and withdrawal below an alliance, an ally’s help and an end to the alliance with one; at war the computer player offers a ceasefire first, and a refusal ends the talks',
    Object.fromEntries(
      Object.entries(menuAt).map(([level, menu]) => [level, firstLevel(menu)])
    ),
    {
      contact: ['OfferPeace', 'DemandTribute', 'Terminate'],
      war: [],
      ceasefire: ['OfferPeace', 'DemandTribute', 'Terminate'],
      peace: [
        'ProposeAlliance',
        'DemandTribute',
        'DemandWithdrawal',
        'Terminate',
      ],
      alliance: ['AskAlly', 'CancelAlliance', 'Terminate'],
    }
  );

  expect(
    'the favours are offered wherever the menu is: war on each other civilization, and sharing maps',
    Object.entries(menuAt)
      .filter(([level]) => level !== 'war')
      .map(([, menu]) => [
        menu.includes('JoinWar'),
        menu.filter((name) => name === 'ShareMaps').length,
      ]),
    [
      [true, 1],
      [true, 1],
      [true, 1],
      [true, 1],
    ]
  );
  expect(
    'at war, the person is asked to answer the ceasefire offered, then hears the war go on',
    warSteps,
    [
      'Initiate:P',
      'Accept(Initiate):C',
      'OfferCeasefire:C',
      'Decline(OfferCeasefire):P',
      'Dialogue:C',
      'Acknowledge(Dialogue):P',
      'Terminate:C',
    ]
  );

  // Gold to give: the gift picker.
  const treasury = defaultGame.playerTreasuries.getByPlayerAndType(us, Gold);

  treasury.add(200 - treasury.value());
  freshTurn();
  await openTalks();

  const gifts = menus[0]!.filter((name) => name === 'Gift');

  expect(
    'with gold in the treasury, the gift picker has gifts of gold, under the gifts (`talksGroup`), the favours under the favours',
    [
      gifts.length > 0,
      negotiations[negotiations.length - 1]!.interactions().length > 0,
    ],
    [true, true]
  );

  // Every gift and favour offered as a step: grouped by the class names the UI reads.
  freshTurn();
  target = (step: any) =>
    step.constructor.name === 'Gift' && step.kind() === 'gold';

  const goldBefore = treasury.value(),
    giftTalks = await openTalks(),
    given = giftTalks
      .interactions()
      .find(
        (step: any) => step.constructor.name === 'Gift' && step.by() === us
      ) as any;

  expect(
    'a gift of gold chosen from the picker is given: our gold goes down by the amount, and the computer player answers it',
    [
      given !== undefined,
      goldBefore - treasury.value() === given?.gift().value(),
      giftTalks
        .interactions()
        .some(
          (step: any) =>
            typeof step.proposal === 'function' && step.proposal() === given
        ),
    ],
    [true, true, true]
  );

  expect(
    'a gift is in the gifts’ list and an exchange, a war and maps in the favours’, as the windows group them',
    [
      talksGroup({ __: inheritance(given ?? {}) } as any),
      ...['ExchangeKnowledge', 'JoinWar', 'ShareMaps'].map((name) =>
        talksGroup({ __: [name] } as any)
      ),
      talksGroup({ __: ['OfferPeace'] } as any),
    ],
    ['gift', 'favour', 'favour', 'favour', null]
  );

  // Maps shared: allied, warm, and both knowing Map Making (`diplomacy.cpp:2397`).
  [us, them].forEach((player) => {
    const research = defaultGame.playerResearch.getByPlayer(player);

    if (!research.completed(MapMaking)) {
      research.addAdvance(MapMaking);
    }
  });

  let mapsShared: Player[] | null = null;
  const sharedListener = (person: Player, computer: Player): void => {
    mapsShared = [person, computer];
  };

  engine.on('civ2-diplomacy:maps-shared', sharedListener);

  const allied = computerAt.alliance!;

  [allied].forEach((player) => {
    const research = defaultGame.playerResearch.getByPlayer(player);

    if (!research.completed(MapMaking)) {
      research.addAdvance(MapMaking);
    }
  });

  freshTurn(allied, 20);
  target = (step: any) => step.constructor.name === 'ShareMaps';

  const mapTalks = await openTalks(allied);

  engine.off('civ2-diplomacy:maps-shared', sharedListener);

  expect(
    'allied, warm and both knowing Map Making, the person proposes to share maps, the computer player accepts, and the maps are shared',
    [
      said.includes('ShareMaps'),
      mapTalks
        .interactions()
        .some(
          (step: any) =>
            step.constructor.name === 'Accept' &&
            step.proposal().constructor.name === 'ShareMaps'
        ),
      mapsShared === null
        ? null
        : (mapsShared as Player[]).map((player) => player === us),
    ],
    [true, true, [true, false]]
  );

  // The computer player's audience (`civ2-diplomacy:audience-due`): heard at the next hand-over, once however often it
  //  is asked for, and led by the computer player.

  const dispose = registerTalkEvents(engine, {
      view: stubView(() => us),
      talks,
      automation: { enabled: false } as any,
    }),
    before = negotiations.length;

  freshTurn();
  menus.length = 0;
  said.length = 0;

  engine.emit('civ2-diplomacy:audience-due', them, us);
  engine.emit('civ2-diplomacy:audience-due', them, us);
  // Not ours: another player's audience.
  engine.emit('civ2-diplomacy:audience-due', them, third);

  expect(
    'an audience asked for isn’t held at once',
    negotiations.length,
    before
  );

  talks.handOver();
  await talks.pending;
  dispose();

  const audiences = negotiations.slice(before);

  expect(
    'the hand-over holds it, once, led by the computer player, who asks to be received',
    [
      audiences.length,
      audiences[0]?.initiator() === them,
      audiences[0]?.interactions()[0]?.constructor.name,
      audiences[0]?.terminated(),
    ],
    [1, true, 'Initiate', true]
  );

  finished = true;
};

run().then(
  () => {
    if (failures.length > 0) {
      process.stderr.write(
        `FAIL civ2Talks (${
          failures.length
        } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
      );
      process.exit(1);
    }

    process.stdout.write(`PASS civ2Talks (${checks} checks)\n`);
    process.exit(0);
  },
  (error) => {
    process.stderr.write(`FAIL civ2Talks: ${error?.stack ?? error}\n`);
    process.exit(1);
  }
);
