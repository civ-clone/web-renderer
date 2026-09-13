import { instance as cityImprovementRegistryInstance } from '@civ-clone/core-city-improvement/CityImprovementRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as goodyHutRegistryInstance } from '@civ-clone/core-goody-hut/GoodyHutRegistry';
import { instance as playerGovernmentRegistryInstance } from '@civ-clone/core-government/PlayerGovernmentRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';
import { instance as tileImprovementRegistryInstance } from '@civ-clone/core-tile-improvement/TileImprovementRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import World from '@civ-clone/core-world/World';

export type Snapshot = {
  turn: number;
  state: { entities: number; fields: number; hash: string };
  mathRandomCalls: number;
  rules: { total: number; byType: { [name: string]: number } };
  dto: { objects: number; bytes: number; hash: string };
  registries: { [name: string]: number };
  world: { width: number; height: number; terrain: string };
  players: string[][];
  cities: string[][];
  units: string[][];
  randomCalls: number;
};

// FNV-1a, 32-bit. Only needs to be stable and dependency-free — this runs
// inside the esbuild bundle, so it cannot reach for node's crypto.
const hash = (input: string): string => {
  let value = 0x811c9dc5;

  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }

  return value.toString(16).padStart(8, '0');
};

// `DataObject.toPlainObject()` is what the renderer transports. Converting
// `#private` fields to `private _x` makes them enumerable own properties, so a
// class reached through the plain-object branch of `toPlainObject` would start
// dragging its registries into the payload. Nothing in the narrow checksum below
// would notice; this does, because a leak moves both the object count and the
// byte size sharply.
const dtoDigest = (
  entities: { toPlainObject(): { objects: object } }[]
): { objects: number; bytes: number; hash: string } => {
  const plain = entities.map((entity) => entity.toPlainObject());
  const parts = plain.map((value) => JSON.stringify(value));

  return {
    objects: plain.reduce(
      (total, value) => total + Object.keys(value.objects).length,
      0
    ),
    bytes: parts.reduce((total, part) => total + part.length, 0),
    hash: hash(parts.join('\u0000')),
  };
};

// Every non-transient field of every saveable entity — the Stage 4 widening.
//
// `stateKeys()` answers "what would be saved", so this is the first thing that
// actually exercises the `transient` declarations against a real game rather
// than against six hand-built objects. A registry that stops being transient,
// or a field that starts being one, moves this number; the narrow subset below
// would not have noticed either.
//
// References are the whole difficulty. `City._player` holds a `Player`, whose
// `_civilization` holds a `Civilization`; `City._tile` holds a `Tile` whose
// `_map` holds the `World` whose `_tiles` holds every tile. Inlining any of
// that either never terminates or hashes the same data hundreds of times, so a
// `DataObject` is represented by its id and nothing else — which is also how
// the save format will have to do it, and means a city changing hands moves the
// digest at both ends.
//
// What is deliberately shallow: anything that is neither a primitive nor a
// `DataObject` is reduced to its class name. `Unit._busy` (a rule),
// `Unit._status` (an `Action`) and `PlayerTreasury._yield` (a `typeof Yield`)
// all land there. That is honest rather than complete — those are exactly the
// fields with no save representation yet, and Stage 6's named rules are what
// they are waiting for. Reducing them to a name still catches one from
// appearing or disappearing.
type Saveable = {
  id(): string;
  stateKeys(): string[];
  [key: string]: unknown;
};

const isSaveable = (value: unknown): value is Saveable =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Saveable).id === 'function' &&
  typeof (value as Saveable).stateKeys === 'function';

const represent = (value: unknown, depth = 0): string => {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (isSaveable(value)) {
    return `#${value.id()}`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => represent(item, depth + 1)).join(',')}]`;
  }

  // A class reference rather than an instance — `typeof Advance`. `name` is the
  // identity that matters and is stable; the function body is not.
  if (typeof value === 'function') {
    return `fn:${value.name}`;
  }

  if (typeof value === 'object') {
    const object = value as {
      entries?: unknown;
      constructor: { name: string };
    };

    // A registry's identity is its membership, in order.
    if (typeof object.entries === 'function') {
      return `${object.constructor.name}${represent(
        (object.entries as () => unknown[])(),
        depth + 1
      )}`;
    }

    // Bounded, because a plain object can nest arbitrarily and this is a
    // checksum rather than a serialiser.
    if (depth >= 3) {
      return object.constructor.name;
    }

    return `${object.constructor.name}{${Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${key}=${represent(
            (object as Record<string, unknown>)[key],
            depth + 1
          )}`
      )
      .join(',')}}`;
  }

  return String(value);
};

const stateDigest = (
  entities: Saveable[]
): { entities: number; fields: number; hash: string } => {
  let fields = 0;

  const parts = entities
    .map((entity) => {
      const keys = entity.stateKeys();

      fields += keys.length;

      return `${entity.id()}|${entity.constructor.name}|${keys
        .map((key) => `${key}=${represent(entity[key])}`)
        .join(';')}`;
    })
    .sort();

  return {
    entities: entities.length,
    fields,
    hash: hash(parts.join('\n')),
  };
};

// Every registered rule, counted by type.
//
// Stage 3 moved rule registration from module singletons to `register(game)`,
// where a missed call — or one registering into a registry nothing reads —
// gives wrong behaviour and no error at all. That happened: `EngineStart` rules
// registered: 0, and the only symptom was a run that ended silently.
//
// Counting by type turns that into a changed fixture naming the rule that went
// missing. It sits outside the checksum, like the other instruments, so that
// adding it does not perturb the state comparison it exists to protect.
const ruleCounts = (): {
  total: number;
  byType: { [name: string]: number };
} => {
  const byType: { [name: string]: number } = {};

  ruleRegistryInstance.entries().forEach((rule: object): void => {
    const name = rule.constructor.name;

    byType[name] = (byType[name] || 0) + 1;
  });

  return {
    total: ruleRegistryInstance.entries().length,
    byType: Object.fromEntries(
      Object.entries(byType).sort(([a], [b]) => a.localeCompare(b))
    ),
  };
};

// The narrow Stage 0 subset, as 05-engine-plan.md requires: entity id, type and
// hand-listed scalars. Nothing rule-computed — `city.yields()` and
// `unit.actions()` reallocate their `Yield` objects on every call, so including
// them would make the checksum change for no reason. Stage 4 widens this to
// every non-transient field once `toState()` exists.
export const snapshot = (
  turn: number,
  randomCalls: number,
  world: World,
  mathRandomCalls: number
): Snapshot => ({
  turn,
  // Every saveable entity the game holds, not only the three registries the
  // narrow subset reports. The world's tiles are included through
  // `world.tiles()` rather than as a registry, because `World._tiles` is the
  // registry and the tiles themselves are the entities.
  state: stateDigest([
    world,
    ...world.tiles(),
    ...cityRegistryInstance.entries(),
    ...cityImprovementRegistryInstance.entries(),
    ...goodyHutRegistryInstance.entries(),
    ...playerGovernmentRegistryInstance.entries(),
    ...playerRegistryInstance.entries(),
    ...playerResearchRegistryInstance.entries(),
    ...playerTreasuryRegistryInstance.entries(),
    ...playerWorldRegistryInstance.entries(),
    ...tileImprovementRegistryInstance.entries(),
    ...unitRegistryInstance.entries(),
  ] as unknown as Saveable[]),
  dto: dtoDigest([
    ...playerRegistryInstance.entries(),
    ...cityRegistryInstance.entries(),
    ...unitRegistryInstance.entries(),
  ]),
  registries: {
    cities: cityRegistryInstance.entries().length,
    cityImprovements: cityImprovementRegistryInstance.entries().length,
    goodyHuts: goodyHutRegistryInstance.entries().length,
    playerGovernments: playerGovernmentRegistryInstance.entries().length,
    playerResearch: playerResearchRegistryInstance.entries().length,
    playerTreasuries: playerTreasuryRegistryInstance.entries().length,
    playerWorlds: playerWorldRegistryInstance.entries().length,
    players: playerRegistryInstance.entries().length,
    tileImprovements: tileImprovementRegistryInstance.entries().length,
    units: unitRegistryInstance.entries().length,
  },
  world: {
    width: world.width(),
    height: world.height(),
    terrain: hash(
      world
        .tiles()
        .map(
          (tile) => `${tile.x()},${tile.y()}:${tile.terrain().constructor.name}`
        )
        .join('|')
    ),
  },
  players: playerRegistryInstance
    .entries()
    .map((player) => [
      player.id(),
      player.civilization().constructor.name,
      player.civilization().leader().constructor.name,
    ])
    .sort((a, b) => a[0].localeCompare(b[0])),
  cities: cityRegistryInstance
    .entries()
    .map((city) => [
      city.id(),
      city.constructor.name,
      city.player().id(),
      city.name(),
      String(city.tile().x()),
      String(city.tile().y()),
    ])
    .sort((a, b) => a[0].localeCompare(b[0])),
  units: unitRegistryInstance
    .entries()
    .map((unit) => [
      unit.id(),
      unit.constructor.name,
      unit.player().id(),
      String(unit.tile().x()),
      String(unit.tile().y()),
      String(unit.active()),
      String(unit.destroyed()),
    ])
    .sort((a, b) => a[0].localeCompare(b[0])),
  randomCalls,
  mathRandomCalls,
  rules: ruleCounts(),
});

// The DTO digest and the stray-`Math.random` count are deliberately outside the
// checksum. The checksum answers "is the engine state the same"; whether
// `toPlainObject` emits the same bytes, and whether anything still reaches the
// global generator, are separate questions with separate answers. Folding them
// together would make none of the three legible — and would mean adding an
// instrument changed the number it was meant to be watching.
export const checksum = ({
  dto,
  mathRandomCalls,
  rules,
  ...state
}: Snapshot): string => hash(JSON.stringify(state));

// `state` stays *inside* the checksum, unlike the three destructured above.
// It is not an instrument — it is the widest available answer to the question
// the checksum asks, and the narrow subset that surrounds it is now a
// human-readable index over the same ground rather than the measurement.

export default snapshot;
