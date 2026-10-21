// The panels around the map, out of `Renderer.ts` (#344): `Hud#build` splits the player's actions and the notices
//  into the end-turn panel, in priority order, and the secondary panel; empties both of the player's actions while
//  waiting; moves the end-turn panel to the end of the game area every time; follows the active unit with its action
//  buttons (none while waiting); and rebuilds the game and player details from the data it is given.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import { GameData, PlayerAction, Tile, Unit } from '../../src/js/UI/types';
import Hud from '../../src/js/UI/game/Hud';
import Portal from '../../src/js/UI/components/Portal';
import Transport from '../../src/js/UI/Transport';
import { assetStore } from '../../src/js/UI/AssetStore';
import i18next from 'i18next';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL hud: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// No IndexedDB under node: every action's picture is its path, so the buttons appear once the promise settles.
(assetStore as any).get = (path: string) =>
  Promise.resolve({ name: path, uri: path });

// linkedom's canvas has no context, so the unit action pictures are skipped.
(globalThis as any).HTMLCanvasElement.prototype.getContext = () => null;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const run = async (): Promise<void> => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: {
        translation: {
          GameDetails: {
            turn: 'Turn {{turn}}',
            year: '{{year}} CE',
          },
          PlayerDetails: {
            header: '{{leader}} of the {{nation}}',
            Treasury: {
              body: '{{value}} gold',
            },
          },
        },
      },
    },
  });

  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="game">
  <div id="actions"></div>
  <div id="secondary-actions"></div>
  <div id="unit-actions"></div>
  <div id="game-info"></div>
  <div id="player-info"></div>
  <div id="map"></div>
</div>`
  );

  const element = (id: string) => document.getElementById(id) as HTMLElement,
    gameArea = element('game'),
    actionArea = element('actions'),
    secondaryActionArea = element('secondary-actions'),
    unitActionArea = element('unit-actions'),
    gameInfo = element('game-info'),
    playerInfo = element('player-info'),
    noticesReadWith: GameData[] = [],
    tilesLookedUp: string[] = [],
    unitTile = { id: 'Tile-3-4', x: 3, y: 4 } as unknown as Tile;

  const hud = new Hud({
    actionArea,
    gameArea,
    gameInfo,
    notices: {
      actions: (data: GameData): PlayerAction<any>[] => {
        noticesReadWith.push(data);

        return [
          {
            _: 'Notice',
            id: 'notice-0',
            value: {
              city: null,
              colours: null,
              dismiss: () => {},
              notification: { key: 'SomethingHappened', data: {} },
            },
          } as unknown as PlayerAction<any>,
        ];
      },
    },
    playerInfo,
    portal: {} as Portal,
    secondaryActionArea,
    transport: {
      send: () => {},
      receive: () => () => {},
    } as unknown as Transport,
    unitActionArea,
    world: {
      get: (x: number, y: number): Tile => {
        tilesLookedUp.push(`${x},${y}`);

        return unitTile;
      },
    },
  });

  const action = (name: string, value: any = {}): PlayerAction =>
      ({ _: name, id: `${name}-1`, value } as unknown as PlayerAction),
    gameData = (turn: number, gold: number): GameData =>
      ({
        difficulty: null,
        player: {
          id: 'Player-1',
          actions: [
            action('AdjustTradeRates'),
            action('EndTurn'),
            action('ActiveUnit'),
            action('CityBuild', { city: { name: 'Thebes' } }),
            action('Revolution'),
            action('ChooseResearch'),
          ],
          cities: [],
          civilization: {
            _: 'Egyptian',
            leader: { _: 'RamessesII' },
            attributes: [],
          },
          government: { current: { _: 'Despotism' }, anarchyTurns: null },
          research: {
            complete: [],
            cost: { value: 10 },
            progress: { value: 0 },
            researching: null,
          },
          treasuries: [{ yield: { _: 'Gold' }, value: gold }],
        },
        turn: { value: turn },
        year: { value: 1000 + turn },
      } as unknown as GameData),
    unit = (id: string): Unit =>
      ({
        id,
        tile: { x: 3, y: 4 },
        actions: [
          { _: 'Fortify', to: { id: 'Tile-3-4' } },
          { _: 'Sleep', to: { id: 'Tile-3-4' } },
        ],
        player: { civilization: { _: 'Egyptian' } },
      } as unknown as Unit);

  const panel = (area: HTMLElement) =>
      Array.from(area.children).map((child) =>
        Array.from(child.querySelector('button')?.classList ?? []).filter(
          (name) => !['large', 'small', 'gradient'].includes(name)
        )
      ),
    unitButtons = () =>
      Array.from(unitActionArea.querySelectorAll('button')).map((button) =>
        button.className.replace('unit-action ', '')
      );

  // The end-turn panel is appended to the game area on every build, so it starts somewhere else.
  expect(
    'the end-turn panel starts first',
    gameArea.firstElementChild === actionArea,
    true
  );

  const first = gameData(1, 30);

  hud.build(first, unit('Settlers-1'), false);

  await settle();

  expect(
    'the end-turn panel holds the primary actions and the notice, lowest priority first',
    panel(actionArea),
    [['notice'], ['cityBuild'], ['chooseResearch'], ['endTurn']]
  );
  expect(
    'the secondary panel holds the rest, in the player order',
    panel(secondaryActionArea),
    [['adjustTradeRates'], ['revolution']]
  );
  expect('the notices are read with the data given', noticesReadWith, [first]);
  expect(
    'the end-turn panel is moved to the end of the game area',
    gameArea.lastElementChild === actionArea,
    true
  );
  expect('the active unit has its buttons', unitButtons(), [
    'Fortify',
    'Sleep',
  ]);
  expect('its tile is looked up in the world', tilesLookedUp, ['3,4']);
  expect(
    'the game details are built from the data given',
    gameInfo.textContent,
    '1001 CETurn 1'
  );
  expect(
    'the player details are built from the data given',
    [
      playerInfo.querySelector('h3')?.textContent,
      playerInfo.querySelector('p:last-child')?.textContent,
    ],
    ['RamessesII of the Egyptian', 'PlayerDetails.Treasury.title30 gold']
  );

  // Something else is appended after it, as the map does, and the next build moves it back to the end.
  gameArea.append(document.createElement('div'));

  hud.build(gameData(2, 45), unit('Settlers-1'), true);

  await settle();

  expect(
    'while waiting, only the notice is on the end-turn panel',
    panel(actionArea),
    [['notice']]
  );
  expect(
    'while waiting, the secondary panel is empty',
    panel(secondaryActionArea),
    []
  );
  expect(
    'the end-turn panel is moved back to the end',
    gameArea.lastElementChild === actionArea,
    true
  );
  expect('while waiting, the unit has no buttons', unitButtons(), []);
  expect("the unit's tile is still looked up", tilesLookedUp, ['3,4', '3,4']);
  expect(
    'the game details follow the data',
    gameInfo.textContent,
    '1002 CETurn 2'
  );
  expect(
    'the player details follow the data',
    playerInfo.querySelector('p:last-child')?.textContent,
    'PlayerDetails.Treasury.title45 gold'
  );

  hud.build(gameData(3, 45), null, false);

  await settle();

  expect('no active unit, no buttons', unitButtons(), []);
  expect('no active unit, no tile looked up', tilesLookedUp, ['3,4', '3,4']);
  expect(
    'the turn is played again: the end-turn button is back',
    panel(actionArea).pop(),
    ['endTurn']
  );

  finished = true;
};

run()
  .catch((error) => {
    failures.push(`threw: ${error?.stack ?? error}`);

    finished = true;
  })
  .then(() => {
    if (failures.length > 0) {
      process.stderr.write(
        `FAIL hud: ${
          failures.length
        } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
      );
      process.exitCode = 1;

      return;
    }

    process.stdout.write(`PASS hud: ${checks} checks\n`);
  });
