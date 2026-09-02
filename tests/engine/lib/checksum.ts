import { instance as cityImprovementRegistryInstance } from '@civ-clone/core-city-improvement/CityImprovementRegistry';
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

// The narrow Stage 0 subset, as 05-engine-plan.md requires: entity id, type and
// hand-listed scalars. Nothing rule-computed — `city.yields()` and
// `unit.actions()` reallocate their `Yield` objects on every call, so including
// them would make the checksum change for no reason. Stage 4 widens this to
// every non-transient field once `toState()` exists.
export const snapshot = (
  turn: number,
  randomCalls: number,
  world: World
): Snapshot => ({
    turn,
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
            (tile) =>
              `${tile.x()},${tile.y()}:${tile.terrain().constructor.name}`
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
});

// The DTO digest is deliberately outside the checksum. Stage 1's acceptance is
// "unchanged checksums", meaning unchanged engine state; a change in what
// `toPlainObject` emits is a separate question with a separate answer, and
// folding the two together would make neither legible.
export const checksum = ({ dto, ...state }: Snapshot): string =>
  hash(JSON.stringify(state));

export default snapshot;
