// The active unit's actions as buttons (#348): one for each of its own-tile actions, a click sending what the key
// would, a picture for each as the issue lays out, and the terrain a Clear or Plant action leaves coming from the
// action class rather than the renderer.

// Must stay first: it gives the component a `document`.
import './lib/dom';

import {
  IconLayer,
  unitActionIconLayers,
} from '../../src/js/UI/lib/unitActionIcon';
import { Tile, Unit, UnitAction } from '../../src/js/UI/types';
import ClearForest from '@civ-clone/base-unit-action-clear-forest/ClearForest';
import ClearJungle from '@civ-clone/base-unit-action-clear-jungle/ClearJungle';
import ClearSwamp from '@civ-clone/base-unit-action-clear-swamp/ClearSwamp';
import Move from '@civ-clone/base-unit-action-move/Move';
import PlantForest from '@civ-clone/base-unit-action-plant-forest/PlantForest';
import UnitActions from '../../src/js/UI/components/UnitActions';
import actionResult from '../../src/js/Engine/AdditionalData/actionResult';
import { keyToActionsMap } from '../../src/js/UI/lib/unitActionKeys';

const failures: string[] = [];
let checks = 0;

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

const tile = { id: 'Tile-1', x: 1, y: 1 } as unknown as Tile,
  action = (_: string, result?: string): UnitAction =>
    ({ _, __: [], id: `${_}-1`, from: tile, to: tile, result } as UnitAction),
  unitOf = (_: string, actions: UnitAction[], busy?: string): Unit =>
    ({
      _,
      __: [],
      id: `${_}-1`,
      actions,
      actionsForNeighbours: {},
      busy: busy ? { _: busy } : null,
      improvements: [],
      player: { civilization: { _: 'Roman' } },
      tile,
    } as unknown as Unit),
  names = (layers: IconLayer[]) =>
    layers.map((layer) => (layer.type === 'image' ? layer.path : layer.type)),
  layersFor = (
    name: string,
    unit = unitOf('Settlers', []),
    onTile: Tile | null = null,
    result?: string
  ) => unitActionIconLayers(action(name, result), unit, onTile, 'S');

// The pictures.
expect(
  'Fortify shows the unit fortified, and marked',
  layersFor('Fortify').map(
    (layer) => layer.type === 'unit' && [layer.fortified, layer.status]
  ),
  [[true, 'S']]
);
expect(
  'SetHomeCity is a marked city, so it is not mistaken for NoOrders or FoundCity',
  [layersFor('SetHomeCity'), layersFor('NoOrders'), layersFor('FoundCity')].map(
    (layers) => layers.map((layer) => [layer.type, (layer as any).text ?? null])
  ),
  [[['city', 'S']], [['unit', null]], [['city', null]]]
);
expect('FoundCity shows an empty city', layersFor('FoundCity'), [
  { type: 'city', text: null, colours: null },
]);
expect(
  'JoinCity shows the city one larger',
  layersFor('JoinCity', unitOf('Settlers', []), {
    city: { growth: { size: 4 } },
    units: [],
  } as unknown as Tile),
  [{ type: 'city', text: '5', colours: null }]
);
expect(
  'ClearJungle shows the terrain the engine said it leaves',
  names(layersFor('ClearJungle', unitOf('Workers', []), null, 'Grassland')),
  ['terrain/land', 'terrain/grassland']
);
expect(
  'a Clear action with no result from the engine falls back to the unit',
  names(layersFor('ClearSwamp')),
  ['unit']
);
expect(
  'PlantForest shows what the engine said',
  names(layersFor('PlantForest', unitOf('Workers', []), null, 'Forest')),
  ['terrain/land', 'terrain/forest']
);
expect(
  'BuildMine shows a mine on a neutral square',
  names(layersFor('BuildMine')),
  ['terrain/land', 'terrain/grassland', 'improvements/mine']
);
expect(
  'BuildIrrigation draws the irrigation beneath the terrain',
  names(layersFor('BuildIrrigation')),
  ['terrain/land', 'improvements/irrigation', 'terrain/grassland']
);
expect('BuildRoad shows a road', names(layersFor('BuildRoad')).slice(2), [
  'improvements/road_w',
  'improvements/road_e',
]);
expect(
  'BuildRailroad shows a railroad',
  names(layersFor('BuildRailroad')).slice(2),
  ['improvements/railroad_w', 'improvements/railroad_e']
);
expect(
  'EstablishTradeRoute shows trade',
  names(layersFor('EstablishTradeRoute')),
  ['city/trade']
);
expect(
  'Unload shows the units aboard as a stack',
  names(
    layersFor('Unload', unitOf('Trireme', []), {
      city: null,
      units: [
        unitOf('Trireme', []),
        unitOf('Legion', [], 'Stowed'),
        unitOf('Settlers', [], 'Stowed'),
      ],
    } as unknown as Tile)
  ),
  ['unit', 'unit']
);
expect(
  'anything else is the unit with the status over it',
  layersFor('Sleep').map((layer) => layer.type === 'unit' && layer.status),
  ['S']
);

// The keys: every action the issue names that has a key still has one.
expect(
  'the keys cover the standing orders',
  ['Explore', 'Automate', 'Sleep', 'Fortify', 'NoOrders'].every((name) =>
    Object.values(keyToActionsMap).some((actions) => actions.includes(name))
  ),
  true
);

// The component.
const sent: any[] = [],
  container = document.createElement('div'),
  buttons = new UnitActions(
    container,
    { send: (...args: any[]) => sent.push(args) } as any,
    () => {}
  ),
  settlers = unitOf('Settlers', [
    action('FoundCity'),
    action('BuildRoad'),
    action('Fortify'),
  ]);

buttons.build(settlers, null);

expect(
  'a button for each action',
  Array.from(container.querySelectorAll('button')).map((button) =>
    button.className.replace('unit-action ', '')
  ),
  ['FoundCity', 'BuildRoad', 'Fortify']
);
expect(
  'the tooltip has the hotkey',
  Array.from(container.querySelectorAll('button')).map(
    (button) => /\((.)\)$/.exec(button.title)?.[1]
  ),
  ['b', 'r', 'f']
);

(container.querySelectorAll('button')[1] as HTMLElement).click();

expect('a click sends what the hotkey sends', sent, [
  [
    'action',
    {
      name: 'ActiveUnit',
      id: 'Settlers-1',
      unitAction: 'BuildRoad',
      target: 'Tile-1',
    },
  ],
]);

const before = container.firstElementChild;

buttons.build(settlers, null);

expect(
  'nothing changing leaves the buttons alone',
  container.firstElementChild,
  before
);

buttons.build(null, null);

expect('no active unit, no buttons', container.children.length, 0);

buttons.build(unitOf('Settlers', []), null);

expect(
  'a unit whose actions have not arrived has no buttons',
  container.children.length,
  0
);

// The engine side.
expect(
  'the engine says what each action leaves behind',
  [ClearForest, ClearJungle, ClearSwamp, PlantForest].map((Action) =>
    actionResult().data({ constructor: Action })
  ),
  ['Plains', 'Grassland', 'Grassland', 'Forest']
);
expect(
  'an action that changes no terrain says nothing',
  actionResult().data({ constructor: Move }),
  null
);

if (failures.length) {
  process.stderr.write(
    `FAIL unitActions\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS unitActions (${checks} checks)`);
