// What a square's terrain does for a unit on it reaches the UI with the terrain (#748): a defender's multiplier and a
//  land unit's cost to move onto it, as Civ1's tables in civ1-unit have them, through the providers Civ1's worker
//  rules register (#865). The map's tooltip says them; the renderer knows no rules (#274).

import {
  Grassland,
  Hills,
  Mountains,
  Ocean,
  River,
} from '@civ-clone/civ1-world/Terrains';
import '@civ-clone/ui-rules-civ1';

const cases: [string, any, { defence: number; movementCost: number | null }][] =
  [
    ['Grassland', new Grassland(), { defence: 1, movementCost: 1 }],
    ['Hills', new Hills(), { defence: 2, movementCost: 2 }],
    ['Mountains', new Mountains(), { defence: 3, movementCost: 3 }],
    ['River', new River(), { defence: 1.5, movementCost: 1 }],
    ['Ocean', new Ocean(), { defence: 1, movementCost: 1 }],
  ];

let failures = 0;

cases.forEach(([label, terrain, expected]) => {
  const { objects } = terrain.toPlainObject(),
    { defence, movementCost } = objects[terrain.id()],
    actual = { defence, movementCost };

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures++;

    console.error(
      `  FAIL ${label.padEnd(10)} ${JSON.stringify(
        actual
      )}, expected ${JSON.stringify(expected)}`
    );
  }
});

if (failures > 0) {
  console.error(`FAIL terrainRules: ${failures} of ${cases.length}`);

  process.exit(1);
}

console.log(`PASS terrainRules (${cases.length} terrains)`);
