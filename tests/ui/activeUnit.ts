// Which unit is active after an update (#189). Every update rebuilds the
// units as fresh objects, so the unit that just moved has to be recognised by
// its id, or focus jumps to whichever unit on screen is listed first.
//
// And asking for the active unit's actions (#323): the worker sends them for
// that unit alone, so a unit made active without them asks, once, and the keys
// find its actions when the answer's patch is in.

import {
  UnitActionsRequest,
  hasUnitActions,
  neighbourActions,
  unitActions,
} from '../../src/js/UI/lib/unitActions';
import { IncrementalReconstituter } from '../../src/js/UI/lib/IncrementalReconstituter';
import { ObjectMap } from '../../src/js/UI/lib/reconstituteData';
import chooseActiveUnit from '../../src/js/UI/lib/chooseActiveUnit';

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

if (failures.length) {
  console.error(`FAIL active unit\n  ${failures.join('\n  ')}`);

  process.exit(1);
}

console.log(`PASS active unit (${checks} checks)`);
