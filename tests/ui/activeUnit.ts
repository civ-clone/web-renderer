// Which unit is active after an update (#189). A full rebuild makes the units
// fresh objects, so the unit that just moved has to be recognised by its id, or
// focus jumps to whichever unit on screen is listed first.
//
// And asking for the active unit's actions (#323): the worker sends them for
// that unit alone, so a unit made active without them asks, once, and the keys
// find its actions when the answer's patch is in.
//
// And the tiles a change of active unit leaves stale on the units layer
// (#327): an update refills the active unit in place, so once it has moved its
// own `tile` is the one it moved to, and the one it left still has to be
// redrawn.
//
// And a move shown before the engine has answered it, with the keys typed
// while it is kept and played once it has been (#326).
//
// And any other order, from a key or a button, waited for the same way, the
// keys typed meanwhile played once it is answered against whichever unit is up
// then (#543).

// Must stay first: it gives the map layers a canvas and a `document` to draw
// with.
import { FakeImage, fakeCanvas } from './lib/fakeCanvas';

import {
  UnitActionsRequest,
  hasUnitActions,
  neighbourActions,
  unitActions,
} from '../../src/js/UI/lib/unitActions';
import { IncrementalReconstituter } from '../../src/js/UI/lib/IncrementalReconstituter';
import { ObjectMap } from '../../src/js/UI/lib/reconstituteData';
import chooseActiveUnit from '../../src/js/UI/lib/chooseActiveUnit';
import ActiveUnitTiles from '../../src/js/UI/lib/ActiveUnitTiles';
import PendingMove, { plainMove } from '../../src/js/UI/lib/PendingMove';
import HaltedUnits from '../../src/js/UI/lib/haltedUnits';
import topologyFor from '../../src/js/UI/lib/topologyFor';
import ActiveUnitController from '../../src/js/UI/game/ActiveUnitController';
import Units from '../../src/js/UI/components/Map/Units';
import ActiveUnit from '../../src/js/UI/components/Map/ActiveUnit';
import { Tile } from '../../src/js/UI/types';
import { TransportHandledAction } from '../../src/js/Engine/Transport';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (actual !== expected) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

const unit = (id: string, x: number, y: number = 0) => ({
    id,
    tile: { x, y },
  }),
  // Columns 0-9 are on screen.
  isVisible = (x: number) => x < 10;

// As the next update would send them: new objects, the moved unit not first.
const offScreen = unit('a', 40),
  onScreen = unit('b', 2),
  moved = unit('c', 5),
  units = [offScreen, onScreen, moved],
  movedBefore = unit('c', 4);

expect(
  'the unit that moved keeps focus, though it is a new object',
  chooseActiveUnit(units, movedBefore.id, isVisible),
  moved
);
expect(
  'an off-screen unit that moved keeps focus too',
  chooseActiveUnit(units, offScreen.id, isVisible),
  offScreen
);
expect(
  'once it has no moves left, the first unit on screen is next',
  chooseActiveUnit([offScreen, onScreen], 'c', isVisible),
  onScreen
);
expect(
  'with no last unit, the first unit on screen',
  chooseActiveUnit(units, null, isVisible),
  onScreen
);
expect(
  'with none on screen, the first unit',
  chooseActiveUnit([offScreen, unit('d', 50)], 'c', isVisible),
  offScreen
);
expect('no units, no active unit', chooseActiveUnit([], 'c', isVisible), null);

// The game data as the frontend holds it: a player whose units came without
// their actions, as every patch now sends them.
const objectMap: ObjectMap = {
    hierarchy: { '#ref': 'Player-1' },
    objects: {
      'Player-1': {
        _: 'Player',
        id: 'Player-1',
        units: [{ '#ref': 'Settlers-1' }, { '#ref': 'Warrior-1' }],
      },
      'Settlers-1': {
        _: 'Settlers',
        id: 'Settlers-1',
        tile: { '#ref': 'PlayerTile-1' },
      },
      'Warrior-1': {
        _: 'Warrior',
        id: 'Warrior-1',
        tile: { '#ref': 'PlayerTile-1' },
      },
      'PlayerTile-1': { _: 'PlayerTile', id: 'PlayerTile-1', x: 3, y: 4 },
      'PlayerTile-2': { _: 'PlayerTile', id: 'PlayerTile-2', x: 4, y: 4 },
    },
  },
  reconstituter = new IncrementalReconstituter(),
  sent: string[] = [],
  request = new UnitActionsRequest((unitId) => sent.push(unitId)),
  settlers = (): any =>
    (reconstituter.rebuild(objectMap, null) as any).units[0];

let active = settlers();

expect(
  'a unit sent without its actions has none',
  hasUnitActions(active),
  false
);
expect(
  'and the keys find nothing rather than throwing',
  unitActions(active).length + neighbourActions(active, 'e').length,
  0
);

request.activate(active);

expect('making it active asks for its actions', sent.join(), 'Settlers-1');

request.activate(active);

expect('and not again while the answer is on its way', sent.length, 1);

// Some other patch arrives first: the data has changed, so a lost answer is
// asked for again.
request.dataReceived();
request.activate(active);

expect('a new data version asks again', sent.join(), 'Settlers-1,Settlers-1');

request.activate(null);

expect('no unit, no request', sent.length, 2);

// The answer, applied as the renderer's `gameDataPatch` handler applies it:
// the unit, with its tiles as refs to tiles the frontend holds.
const answer = {
  hierarchy: { '#ref': 'Settlers-1' },
  objects: {
    'Settlers-1': {
      _: 'Settlers',
      id: 'Settlers-1',
      tile: { '#ref': 'PlayerTile-1' },
      actions: [
        {
          _: 'Fortify',
          id: 'Fortify-1',
          from: { '#ref': 'PlayerTile-1' },
          to: { '#ref': 'PlayerTile-1' },
        },
      ],
      actionsForNeighbours: {
        e: [
          {
            _: 'Move',
            id: 'Move-1',
            from: { '#ref': 'PlayerTile-1' },
            to: { '#ref': 'PlayerTile-2' },
          },
        ],
        w: [],
      },
    },
  },
};

objectMap.objects['Settlers-1'] = answer.hierarchy;
Object.assign(objectMap.objects, answer.objects);
request.dataReceived();

active = settlers();
request.activate(active);

expect('once its actions are in, it does not ask again', sent.length, 2);
expect('the unit has its actions', hasUnitActions(active), true);
expect(
  'the action keys find them',
  unitActions(active)
    .map((action) => action._)
    .join(),
  'Fortify'
);
expect(
  'the direction keys find them, with the tile to move to',
  neighbourActions(active, 'e')
    .map((action) => `${action._} ${action.to.x},${action.to.y}`)
    .join(),
  'Move 4,4'
);
expect(
  'a direction with nothing to do is empty',
  neighbourActions(active, 'n').length,
  0
);

const warrior = (reconstituter.rebuild(objectMap, null) as any).units[1];

request.activate(warrior);

expect(
  'moving on to another unit without them asks for that one',
  sent.join(),
  'Settlers-1,Settlers-1,Warrior-1'
);

const staleTiles = new ActiveUnitTiles(),
  refreshed = (): string =>
    staleTiles
      .take()
      .map(({ x, y }) => `${x},${y}`)
      .sort()
      .join(' ');

let data = reconstituter.rebuild(objectMap, null) as any;

const [moving, next] = data.units;

staleTiles.change(moving);

expect('making a unit active refreshes its tile', refreshed(), '3,4');
expect('and only once', refreshed(), '');

// The move, as its patch sends it: the unit, on the tile it moved to.
objectMap.objects['Settlers-1'] = {
  ...objectMap.objects['Settlers-1'],
  tile: { '#ref': 'PlayerTile-2' },
};
data = reconstituter.rebuild(objectMap, ['Settlers-1']);

expect('the unit that moved is the same object', data.units[0], moving);
expect(
  'now on the tile it moved to',
  `${moving.tile.x},${moving.tile.y}`,
  '4,4'
);

// The update makes it active again.
staleTiles.change(data.units[0]);

expect(
  'a move refreshes the tile it left and the tile it moved to',
  refreshed(),
  '3,4 4,4'
);

// Wait, and the next unit is active.
staleTiles.change(next);

expect(
  'the next unit refreshes the tile the last one stands on, and its own',
  refreshed(),
  '3,4 4,4'
);

staleTiles.change(null);

expect('no unit refreshes the tile the last one stood on', refreshed(), '3,4');

// A move shown before its answer (#326). A row of ten tiles, a Chariot on the
// fourth with a Militia under it, and a Legion of the same player's further on.
const game: ObjectMap = {
    hierarchy: { '#ref': 'Player-2' },
    objects: {
      'Player-2': {
        _: 'Player',
        id: 'Player-2',
        tiles: [...Array(10).keys()].map((x) => ({ '#ref': `Tile-${x}` })),
        units: [
          { '#ref': 'Chariot-1' },
          { '#ref': 'Militia-1' },
          { '#ref': 'Legion-1' },
        ],
      },
      ...Object.fromEntries(
        [...Array(10).keys()].map((x) => [
          `Tile-${x}`,
          { _: 'PlayerTile', id: `Tile-${x}`, x, y: 0, units: [] },
        ])
      ),
    },
  },
  gameReconstituter = new IncrementalReconstituter(),
  tileRef = (x: number) => ({ '#ref': `Tile-${x}` });

// The engine's answer for a unit: on tile `x`, with what it can do each way (a
// Move to the next tile unless said otherwise), and every tile listing who is
// on it. `null` leaves its actions out, as for a unit not yet asked about.
const place = (
  id: string,
  x: number,
  actions: { [direction: string]: string } | null = { e: 'Move', w: 'Move' }
) => {
  game.objects[id] = {
    _: id.split('-')[0],
    id,
    tile: tileRef(x),
    ...(actions === null
      ? {}
      : {
          actions: ['Fortify', 'NoOrders'].map((name) => ({
            _: name,
            id: `${name}-${id}`,
            from: tileRef(x),
            to: tileRef(x),
          })),
          actionsForNeighbours: Object.fromEntries(
            Object.entries(actions).map(([direction, name]) => {
              const to = x + (direction === 'e' ? 1 : -1);

              return [
                direction,
                [
                  {
                    _: name,
                    id: `${name}-${id}-${to}`,
                    from: tileRef(x),
                    to: tileRef(to),
                  },
                ],
              ];
            })
          ),
        }),
  };

  [...Array(10).keys()].forEach((x) => {
    game.objects[`Tile-${x}`].units = ['Chariot-1', 'Militia-1', 'Legion-1']
      .filter((ref) => game.objects[ref]?.tile['#ref'] === `Tile-${x}`)
      .map((ref) => ({ '#ref': ref }));
  });
};

// The renderer's half, through the `ActiveUnitController` that `GameSession`
// drives: a unit key goes through `pressKey`, a plain Move is sent and drawn on
// its tile at once, each update makes the next unit active and plays the keys
// kept for its orders, and the move's own acknowledgement settles it and plays
// the keys kept behind it.
const sentActions: string[] = [],
  // What the worker has yet to acknowledge, in the order it was sent.
  unacknowledged: TransportHandledAction[] = [],
  pendingMove = new PendingMove<Tile>(),
  // The tiles the controller has the units layer draw again.
  layerTiles: Tile[] = [],
  // The units whose actions the controller asked the worker for (#323).
  actionsAskedFor: string[] = [];

let gameData: any = null;

// The map layers, each tile drawn at its column of a canvas the size of the
// row.
class TestUnits extends Units {
  protected placements(tile: Tile): [number, number][] {
    return [[tile.x * this.tileSize(), 0]];
  }

  protected renderUnit(unit: any): CanvasImageSource {
    return new FakeImage(unit._, 16, 16) as any;
  }

  update(tiles: Tile[]): void {
    layerTiles.push(...tiles);
  }

  // What the layer itself does with an update, which the controller's are kept from.
  redraw(tiles: Tile[]): void {
    super.update(tiles);
  }
}

class TestActiveUnit extends ActiveUnit {
  protected placements(tile: Tile): [number, number][] {
    return [[tile.x * this.tileSize(), 0]];
  }

  protected renderUnit(unit: any): CanvasImageSource {
    return new FakeImage(unit._, 16, 16) as any;
  }
}

const topology = topologyFor({ width: 10, height: 1 }),
  world = {
    get: (x: number) => gameData.tiles[x],
    width: () => 10,
    height: () => 1,
    topology: () => topology,
  },
  layer = <T extends typeof Units>(Layer: T) => {
    const { calls, canvas } = fakeCanvas(320, 32);

    return {
      calls,
      layer: new Layer(world as any, 2, 16, canvas) as InstanceType<T>,
    };
  },
  unitsLayer = layer(TestUnits),
  activeLayer = layer(TestActiveUnit),
  controller = new ActiveUnitController({
    activeUnitLayer: activeLayer.layer,
    arrivalClosed: () => {},
    data: () => ({ player: gameData } as any),
    haltedUnits: new HaltedUnits(),
    options: { get: (key: string, defaultValue: any = null) => defaultValue },
    pendingMove,
    portal: {
      isVisible: () => true,
      render: () => {},
      setActiveUnit: () => {},
      setCenter: () => {},
    },
    scheduleRender: () => {},
    showUnitDetails: () => {},
    // The action as the renderer sends it, and the worker acknowledges it.
    transport: {
      send: ((name: string, action: TransportHandledAction) => {
        if (name === 'unitActions') {
          actionsAskedFor.push(action as unknown as string);
        }

        if (name !== 'action') {
          return;
        }

        sentActions.push(
          action.unitAction === 'Move'
            ? `${action.id} Move ${game.objects[action.target!].x}`
            : `${action.id} ${action.unitAction}`
        );
        unacknowledged.push(action);
      }) as any,
    },
    unitsLayer: unitsLayer.layer,
    world: world as any,
  }),
  current = (): any => controller.active();

const find = (id: string | null) =>
    gameData.units.find((unit: any) => unit.id === id) ?? null,
  press = (...keys: string[]) =>
    keys.forEach((key) => controller.pressKey(key)),
  // A patch: the answer to an action, or to a `unitActions` request. The
  // player's actions name the unit that can act, as `GameSession`'s
  // `onUpdated` passes them on.
  update = (activeId: string | null) => {
    gameData = gameReconstituter.rebuild(game, null);

    controller.next(
      [find(activeId)]
        .filter((unit) => unit !== null)
        .map((unit) => ({ _: 'ActiveUnit', value: unit } as any)),
      false
    );

    controller.drain();
  },
  // The worker's `actionHandled`, after the patch with the action's result.
  acknowledge = (action: TransportHandledAction) =>
    controller.actionHandled(action),
  // The acknowledgement of the oldest action sent, if any is waiting: a key
  // sent when it should have been kept leaves fewer than the checks expect.
  acknowledgeOldest = () => {
    const action = unacknowledged.shift();

    if (action) {
      acknowledge(action);
    }
  },
  // The answer to the oldest action sent: its patch, then its acknowledgement.
  respond = (activeId: string | null) => {
    update(activeId);

    acknowledgeOldest();
  },
  drawnAt = (): number =>
    (pendingMove.destination(current().id) ?? current().tile).x,
  // The tiles the next render of the active unit draws again.
  refreshedTiles = (): string => {
    controller.render(current());

    return layerTiles
      .splice(0)
      .map(({ x }) => x)
      .sort()
      .join();
  };

expect(
  'only a lone Move is shown before its answer',
  [
    plainMove([{ _: 'Move' }] as any),
    plainMove([{ _: 'Attack' }] as any),
    plainMove([{ _: 'Move' }, { _: 'EstablishTradeRoute' }] as any),
    plainMove([]),
  ]
    .map((action) => action?._ ?? '-')
    .join(),
  'Move,-,-,-'
);

place('Militia-1', 3, null);
place('Legion-1', 8, null);
place('Chariot-1', 3);
update('Chariot-1');

// Each sprite drawn, as its unit and the column it was drawn in, with a + for
// the copy behind a stack.
const drawn = ({ calls }: { calls: any[][] }, draw: () => void): string => {
    calls.splice(0);

    draw();

    return calls
      .filter(([name]) => name === 'drawImage')
      .map(([, image, x]) =>
        x % 32 === 0
          ? `${image.path} ${x / 32}`
          : `${image.path} ${(x + 2) / 32}+`
      )
      .join(', ');
  },
  // What the units layer draws on the Chariot's tile and the next, and what
  // the active unit's layer draws.
  showLayers = (): string =>
    `units: ${drawn(unitsLayer, () =>
      unitsLayer.layer.redraw([3, 4].map((x) => gameData.tiles[x]))
    )}; active: ${drawn(activeLayer, () => activeLayer.layer.render())}`;

expect(
  'before a move, the Chariot is drawn on its stack, which the units layer leaves to it',
  showLayers(),
  'units: ; active: Chariot 3+, Chariot 3'
);

refreshedTiles();
press('ArrowRight');

expect('a Move key is sent at once', sentActions.join(), 'Chariot-1 Move 4');
expect(
  'and the Chariot is drawn on the tile it is moving to, before any answer, the Militia left behind',
  showLayers(),
  'units: Militia 3; active: Chariot 4'
);
expect('both tiles are drawn again', refreshedTiles(), '3,4');

press('ArrowRight', 'ArrowRight');

expect(
  'the keys typed while the move is answered are kept',
  sentActions.length,
  1
);

// The engine refuses: a zone of control, say. The Chariot is where it was.
respond('Chariot-1');

expect(
  'a refused move snaps back, on to its stack',
  showLayers(),
  'units: ; active: Chariot 3+, Chariot 3'
);
expect('both tiles are drawn again', refreshedTiles(), '3,4');
expect(
  'and the keys typed after it go too, unplayed',
  `${sentActions.length} ${pendingMove.queued()}`,
  '1 false'
);

// A Chariot has three moves, and three keys are typed quickly.
sentActions.splice(0);
press('ArrowRight', 'ArrowRight', 'ArrowRight');

expect('the first key is sent', sentActions.join(), 'Chariot-1 Move 4');

place('Chariot-1', 4);
respond('Chariot-1');

expect(
  'the second is sent once the first is answered',
  sentActions.join(' / '),
  'Chariot-1 Move 4 / Chariot-1 Move 5'
);
expect('and drawn where it is going', drawnAt(), 5);
expect(
  'an arrived move leaves nothing behind it',
  showLayers(),
  'units: Militia 3; active: Chariot 5'
);

place('Chariot-1', 5);
respond('Chariot-1');

expect(
  'then the third, once the second is',
  sentActions.join(' / '),
  'Chariot-1 Move 4 / Chariot-1 Move 5 / Chariot-1 Move 6'
);

// Its last move, and the Legion is up.
place('Chariot-1', 6, {});
place('Legion-1', 8);
respond('Legion-1');

expect(
  'three keys, three moves',
  `${sentActions.length} ${pendingMove.pending()}`,
  '3 false'
);

// A key with nothing to do that way by the time it is played.
sentActions.splice(0);
press('ArrowRight', 'ArrowUp', 'ArrowLeft');
place('Legion-1', 9, { w: 'Move' });
respond('Legion-1');

expect(
  'a kept key with nothing to do is dropped, and the next one played',
  sentActions.join(' / '),
  'Legion-1 Move 9 / Legion-1 Move 8'
);

// An order kept behind a move waits for the move's answer, and the keys after
// it for its own.
sentActions.splice(0);
place('Legion-1', 8);
respond('Legion-1');
press('ArrowRight', 'f', 'ArrowLeft');
place('Legion-1', 9, { w: 'Move' });
respond('Legion-1');

expect(
  'an order kept behind a move goes once the move is answered',
  sentActions.join(' / '),
  'Legion-1 Move 9 / Legion-1 Fortify'
);
expect('and the key after it waits', pendingMove.queued(), true);

// Fortified, and the Militia is up: the key typed after the order is kept for
// it, the unit up once the order is answered (#543).
place('Militia-1', 3, null);
respond('Militia-1');

expect(
  'the keys typed after an order are kept for the unit up once it is answered',
  `${sentActions.length} ${pendingMove.queued()}`,
  '2 true'
);

// The Militia's actions are still on their way.
expect(
  'a unit made active without its actions has them asked for',
  actionsAskedFor.includes('Militia-1'),
  true
);

sentActions.splice(0);
press('ArrowLeft');

expect(
  'keys for a unit whose orders are on their way are kept',
  `${sentActions.length} ${pendingMove.queued()}`,
  '0 true'
);

// Another patch, the actions still not in: the keys wait for them, rather than being read against none.
update('Militia-1');

expect(
  'and stay kept through an update that does not bring them',
  `${sentActions.length} ${pendingMove.queued()}`,
  '0 true'
);

place('Militia-1', 3);
update('Militia-1');

expect(
  'and go out once they arrive, one at a time',
  sentActions.join(' / '),
  'Militia-1 Move 2'
);

place('Militia-1', 2);
respond('Militia-1');

expect(
  'each after the last is answered',
  sentActions.join(' / '),
  'Militia-1 Move 2 / Militia-1 Move 1'
);

// Other patches can arrive between a move and its answer: the answers to
// `unitActions` requests made again for the same unit, say, with the unit still
// on the tile it left. Neither is the move's answer.
place('Militia-1', 1);
respond('Militia-1');
sentActions.splice(0);
press('ArrowRight', 'ArrowRight');
update('Militia-1');
update('Militia-1');

expect(
  'a patch before the move is acknowledged does not settle it',
  `${pendingMove.pending()} ${drawnAt()} ${pendingMove.queued()}`,
  'true 2 true'
);
expect(
  'nor play the keys kept behind it',
  sentActions.join(' / '),
  'Militia-1 Move 2'
);

place('Militia-1', 2);
respond('Militia-1');

expect(
  'its acknowledgement does',
  sentActions.join(' / '),
  'Militia-1 Move 2 / Militia-1 Move 3'
);

// A move that starts talks: the worker asks, and waits for the choice, before
// it sends the move's answer, so the window opens and closes before it. The
// renderer's `chooseFromList` receiver forgets the keys when it opens.
place('Militia-1', 3);
respond('Militia-1');
sentActions.splice(0);
press('ArrowRight', 'ArrowRight', 'ArrowRight');
pendingMove.clearKeys();

expect(
  'talks the move opened forget the keys typed before them',
  pendingMove.queued(),
  false
);
expect(
  'but the move is still drawn ahead',
  `${pendingMove.pending()} ${drawnAt()}`,
  'true 4'
);

place('Militia-1', 4);
respond('Militia-1');

expect(
  'and once the talks are over and the move answered, nothing more is played',
  `${sentActions.join(' / ')} ${pendingMove.pending()}`,
  'Militia-1 Move 4 false'
);

// Any other order is waited for too (#543): until its acknowledgement the
// page holds the unit as it was before it, and a key read against it would be
// sent for a unit that has already acted. The keys typed meanwhile go to
// whichever unit is up once it is answered.
sentActions.splice(0);
press(' ', 'ArrowLeft');

expect(
  'an order is sent at once',
  sentActions.join(' / '),
  'Militia-1 NoOrders'
);
expect(
  'the key typed after it is kept, not sent for the unit that has just acted',
  `${sentActions.length} ${pendingMove.pending()} ${pendingMove.queued()}`,
  '1 true true'
);

// Its patch: the Militia is done, and the Legion is up, with its actions.
place('Legion-1', 8);
update('Legion-1');

expect(
  'the patch before the acknowledgement does not play it',
  `${sentActions.length} ${pendingMove.queued()}`,
  '1 true'
);

acknowledgeOldest();

expect(
  'the acknowledgement plays it, against the unit now up',
  sentActions.join(' / '),
  'Militia-1 NoOrders / Legion-1 Move 7'
);

place('Legion-1', 7);
respond('Legion-1');

// An order after which the same unit is still up: the keys are its own.
sentActions.splice(0);
press('f', 'ArrowLeft');
update('Legion-1');
acknowledgeOldest();

expect(
  'the keys after an order that leaves the unit up are played against it',
  sentActions.join(' / '),
  'Legion-1 Fortify / Legion-1 Move 6'
);

place('Legion-1', 6);
respond('Legion-1');

// A button is an order too, sent for the active unit as it is now: the Legion
// has moved, so it is aimed at the tile it is on.
sentActions.splice(0);

expect(
  'a button drawn for a unit no longer up does nothing',
  `${controller.act('Militia-1', 'Fortify')} ${sentActions.length}`,
  'false 0'
);
expect(
  'a button sends its action for the unit as it is now',
  `${controller.act('Legion-1', 'Fortify')} ${sentActions.join()} ${
    unacknowledged[0]?.target
  }`,
  'true Legion-1 Fortify Tile-6'
);
expect(
  'a second click before it is answered does nothing',
  `${controller.act('Legion-1', 'NoOrders')} ${sentActions.length}`,
  'false 1'
);

press('ArrowLeft');

expect(
  'a key after a button is kept',
  `${sentActions.length} ${pendingMove.queued()}`,
  '1 true'
);

update('Legion-1');
acknowledgeOldest();

expect(
  'and played once its order is answered',
  sentActions.join(' / '),
  'Legion-1 Fortify / Legion-1 Move 5'
);

place('Legion-1', 5);
respond('Legion-1');

// A window opened before the order is answered (talks it started): the
// renderer's `chooseFromList` receiver forgets the keys, and the order is still
// waited for.
sentActions.splice(0);
press('f', 'ArrowLeft', 'ArrowLeft');
controller.clearKeys();

expect(
  'a window forgets the keys kept behind an order',
  `${sentActions.length} ${pendingMove.queued()} ${pendingMove.pending()}`,
  '1 false true'
);

update('Legion-1');
acknowledgeOldest();

expect(
  'and its answer plays nothing more, and is waited for no longer',
  `${sentActions.join(' / ')} ${pendingMove.pending()}`,
  'Legion-1 Fortify false'
);

// The turn ends with an order on its way, sent as End Turn was: the worker
// has stopped listening, so it is never answered.
sentActions.splice(0);
press('f', 'ArrowLeft');
controller.next([], true);
unacknowledged.splice(0);

expect(
  'the end of the turn waits for it no longer, and forgets the keys',
  `${pendingMove.pending()} ${pendingMove.queued()}`,
  'false false'
);

// The next turn.
update('Legion-1');
press('ArrowLeft');

expect(
  "so the next turn's keys go at once",
  sentActions.join(' / '),
  'Legion-1 Fortify / Legion-1 Move 4'
);

place('Legion-1', 4);
respond('Legion-1');

// An attack is waited for too, but its keys are the attacker's, as a move's
// are (#326): played against it if it is still up once the attack is
// answered, forgotten if another unit is up.
const attacker = (actions: { [direction: string]: string }) => {
  place('Legion-1', 4, actions);
  game.objects['Legion-1'].player = { '#ref': 'Player-2' };
};

attacker({ e: 'Attack' });
update('Legion-1');
sentActions.splice(0);
press('ArrowRight', 'ArrowLeft');

expect(
  'an attack is waited for',
  `${sentActions.join(' / ')} ${pendingMove.queued()}`,
  'Legion-1 Attack true'
);

// Won, and the Legion has a move left.
attacker({ e: 'Attack', w: 'Move' });
update('Legion-1');
acknowledgeOldest();

expect(
  'the key typed after an attack the unit survived is played against it',
  sentActions.join(' / '),
  'Legion-1 Attack / Legion-1 Move 3'
);

attacker({ e: 'Attack' });
respond('Legion-1');
sentActions.splice(0);
press('ArrowRight', 'ArrowLeft');

// Lost in its own attack: the Chariot is up.
delete game.objects['Legion-1'];
game.objects['Player-2'].units = game.objects['Player-2'].units.filter(
  (ref: { '#ref': string }) => ref['#ref'] !== 'Legion-1'
);
place('Chariot-1', 6);
update('Chariot-1');

expect(
  'the keys typed after an attack are forgotten when another unit is up',
  `${sentActions.join(' / ')} ${pendingMove.queued()}`,
  'Legion-1 Attack false'
);

acknowledgeOldest();

expect(
  'and its answer plays nothing for the next unit',
  `${sentActions.join(' / ')} ${pendingMove.pending()}`,
  'Legion-1 Attack false'
);

// A plain move is waited for as it was (#326): the keys kept behind it are
// forgotten when its answer leaves another unit up.
place('Chariot-1', 5);
update('Chariot-1');
sentActions.splice(0);
press('ArrowLeft', 'ArrowLeft');
place('Chariot-1', 4, {});
place('Militia-1', 4);
respond('Militia-1');

expect(
  'the keys kept behind a move are forgotten when another unit is up',
  `${sentActions.join(' / ')} ${pendingMove.queued()} ${pendingMove.pending()}`,
  'Chariot-1 Move 4 false false'
);

// After an update with several units that can act, the one that was active stays so, though it is not the first
//  listed (#189).
const updateWith = (...ids: string[]) => {
  gameData = gameReconstituter.rebuild(game, null);

  controller.next(
    ids.map((id) => ({ _: 'ActiveUnit', value: find(id) } as any)),
    false
  );
};

place('Chariot-1', 4);
updateWith('Chariot-1', 'Militia-1');

expect(
  'the unit that was active stays active after an update, though another is listed first',
  current().id,
  'Militia-1'
);

// A window the answer opened has the keys kept behind it, as it would a key typed now: a modal one, or one with the
//  focus.
const page = document as any,
  querySelector = page.querySelector;

sentActions.splice(0);
press('ArrowLeft', 'ArrowLeft', 'ArrowLeft');
place('Militia-1', 3);
page.querySelector = (selector: string) =>
  selector === 'dialog.window.modal[open]' ? {} : querySelector(selector);
respond('Militia-1');
page.querySelector = querySelector;

expect(
  'a modal window the answer opened takes the keys kept behind the move: they are forgotten',
  `${sentActions.join(' / ')} ${pendingMove.queued()}`,
  'Militia-1 Move 3 false'
);

sentActions.splice(0);
press('ArrowLeft', 'ArrowLeft');
place('Militia-1', 2);
page.activeElement = {
  closest: (selector: string) => selector === 'dialog.window',
};
respond('Militia-1');
delete page.activeElement;

expect(
  'and so does a window with the focus',
  `${sentActions.join(' / ')} ${pendingMove.queued()}`,
  'Militia-1 Move 2 false'
);

const limited = new PendingMove();

limited.start('Chariot-1', { id: 'Tile-4', x: 4, y: 0 });

expect(
  'no more than eight keys are kept',
  [...Array(10).keys()].map(() => limited.queueKey('ArrowRight')).join(),
  'true,true,true,true,true,true,true,true,false,false'
);

if (failures.length) {
  console.error(`FAIL active unit\n  ${failures.join('\n  ')}`);

  process.exit(1);
}

console.log(`PASS active unit (${checks} checks)`);
