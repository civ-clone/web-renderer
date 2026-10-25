import { DataPatch, GameData, Tile } from '../types';
import { ObjectMap, PlainObject } from '../lib/reconstituteData';
import DataChanges, { instance as sharedChanges } from '../lib/DataChanges';
import IncrementalReconstituter from '../lib/IncrementalReconstituter';
import PruneSchedule from '../lib/PruneSchedule';
import applyDataPatches from '../lib/applyDataPatches';
import pruneObjectMap from '../lib/pruneObjectMap';

// The game's data on the page (#344): the object map the worker's patches are
//  applied to, the data rebuilt from it, and when it is rebuilt. Moved out of
//  `Renderer`'s `gameData` handler; `GameSession` decides what an update means
//  for the screen, in the `onUpdated` callback.
//
// During the player's own turn every update is synchronous, in the same call
//  stack as the patch: the input handlers read the active unit straight after,
//  and deferring the rebuild (tried 2026-07-02) left it stale for a frame and
//  broke consecutive moves of multi-move units. While waiting for the turn
//  there is no input to keep up with, so however many patches the other
//  civilizations' moves send, the data is rebuilt at most once a frame (#61).

/** Schedules the deferred rebuild while waiting: `requestAnimationFrame` on the page, a fake in the tests. */
export type FrameScheduler = {
  request(callback: () => void): number;
  cancel(handle: number): void;
};

/** Where the map's tiles go: `MapView`'s `world` and its queue of tiles to draw. */
export type GameStateTiles = {
  /** Each `PlayerTile` a patch carries, and the tile of each unit and city it changes the look of, once they are in the map. */
  queueTile(tile: Tile): void;
  /** After each rebuild, with whether the world's tiles were refilled. */
  setTiles(tiles: Tile[], changed: boolean): void;
};

export type GameStateOptions = {
  changes?: DataChanges;
  frames?: FrameScheduler;
  /** The tests' own, to see what it still tracks after a prune. */
  reconstituter?: IncrementalReconstituter;
  tiles: GameStateTiles;
};

const animationFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

// What the map draws of a unit, as the map holds it (refs and all): its type,
//  its owner, its square, what it is busy with and whether it is fortified.
//  `null` for anything that is not a unit.
const drawnUnit = (value: PlainObject | undefined): string | null =>
  value?.__?.includes('Unit')
    ? JSON.stringify([
        value._,
        value.player,
        value.tile,
        value.busy,
        value.improvements,
      ])
    : null;

// What the map draws of a city, as the map holds it, given its growth: its
//  owner, whose colours it is drawn in and whose list its name is looked up in,
//  its name, its square, its size and whether the engine has declared it in
//  disorder. Your own city's size is in its growth, a separate object; a
//  rival's, the stand-in you are sent, holds it inline. No layer draws a city's
//  improvements, such as its walls, so they are left out. `null` for anything
//  that is not a city. A city that changes hands to or from you changes id (your
//  city or a rival's stand-in), so that, and a city destroyed, still rely on the
//  worker sending the tile with it.
const drawnCity = (
  value: PlainObject | undefined,
  growth: PlainObject | undefined
): string | null =>
  value?.__?.includes('City')
    ? JSON.stringify([
        value.player,
        value.name,
        value.tile,
        value.civilDisorderDeclared,
        (growth ?? value.growth)?.size,
      ])
    : null;

export class GameState {
  #changes: DataChanges;
  // Rebuilds only what the patches since the last update reached (#322):
  //  every id they added, replaced or edited in place goes here until
  //  `update` takes it, so patches coalesced while waiting for the turn are
  //  all accounted for.
  #changedIds = new Set<string>();
  #currentObjectCount: number;
  // How many objects the map holds, kept as patches add them and prunes take them out:
  //  counting the keys of a late game's map on every update cost ~12 ms
  //  (#480).
  #objectCount: number;
  #currentTurn: number;
  #data: GameData;
  #frames: FrameScheduler;
  // The map as it arrived: the transport does not rebuild it, so that it is
  //  rebuilt once, here (#333). Patched and pruned in place, until `replace`
  //  hands over another.
  #objectMap: ObjectMap;
  #pruneSchedule: PruneSchedule;
  #reconstituter: IncrementalReconstituter;
  #stateFrame: number | null = null;
  #tiles: GameStateTiles;
  #updated: () => void = () => {};
  // From the worker accepting `EndTurn` until it hands the next turn over.
  //  Nothing sent in between is listened for, and the data still describes
  //  the turn just ended, so there is nothing to select or act on (#61, #130).
  #waitingForTurn = false;

  /** Rebuilds everything from `objectMap` straight away; `update` is not run until asked for. */
  constructor(
    objectMap: ObjectMap,
    {
      changes = sharedChanges,
      frames = animationFrames,
      reconstituter = new IncrementalReconstituter(),
      tiles,
    }: GameStateOptions
  ) {
    this.#changes = changes;
    this.#frames = frames;
    this.#objectMap = objectMap;
    this.#reconstituter = reconstituter;
    this.#tiles = tiles;

    this.#data = this.#reconstituter.rebuild(objectMap, null) as GameData;

    this.#objectCount = Object.keys(objectMap.objects).length;
    this.#pruneSchedule = new PruneSchedule(this.#objectCount);

    this.#currentTurn = Number(this.#data?.turn?.value ?? 0);
    this.#currentObjectCount = this.#objectCount;
  }

  /** The data as last rebuilt. The same object between full rebuilds: it is refilled in place. */
  data(): GameData {
    return this.#data;
  }

  /** The turn and object count the last update saw, for the debug panel. */
  currentTurn(): number {
    return this.#currentTurn;
  }

  currentObjectCount(): number {
    return this.#currentObjectCount;
  }

  waiting(): boolean {
    return this.#waitingForTurn;
  }

  /** `false` when the next turn is handed over: the rebuild deferred while waiting is dropped, for `update` to do. */
  setWaiting(waiting: boolean): void {
    this.#waitingForTurn = waiting;

    if (!waiting) {
      this.#cancelUpdate();
    }
  }

  /** Run at the end of every update, after the rebuild, the prune and the world's tiles. One callback. */
  onUpdated(callback: () => void): void {
    this.#updated = callback;
  }

  /** A `gameDataPatch`: applied to the map, then rebuilt now, or next frame while waiting for the turn. */
  applyPatches(patches: DataPatch[]): void {
    // The squares of the units and cities whose look a patch changed, where
    //  they are and where they were. A unit can come on its own, as one that
    //  finishes fortifying does at the start of the turn, with no tile to say
    //  its square needs drawing again (#487), and so can a city (#578). Looked
    //  up once the patches are in, as the tile can come after the unit.
    const tileIds = new Set<string>(),
      queueTiles = (...tiles: (PlainObject | undefined)[]): void =>
        tiles.forEach((tile) => {
          if (tile?.['#ref']) {
            tileIds.add(tile['#ref']);
          }
        }),
      // The cities and growths the patches replaced, each as the map held it
      //  before the first of them. A city's size is in its growth, which can
      //  come before the city, after it, or alone, so cities are compared once
      //  the patches are in.
      before = new Map<string, PlainObject | undefined>(),
      cityIds = new Set<string>(),
      growthIds = new Set<string>();

    applyDataPatches(this.#objectMap, patches, {
      changed: (id) => this.#changedIds.add(id),
      set: (id, value, previous) => {
        if (previous === undefined) {
          this.#objectCount++;
        }

        const ids = value.__?.includes('City')
          ? cityIds
          : value.__?.includes('CityGrowth')
          ? growthIds
          : null;

        if (ids !== null) {
          ids.add(id);

          if (!before.has(id)) {
            before.set(id, previous);
          }

          return;
        }

        const drawn = drawnUnit(value);

        if (drawn === null || drawn === drawnUnit(previous)) {
          return;
        }

        queueTiles(value.tile, previous?.tile);
      },
      // Since we only use the queued tiles for x and y this should be fine...
      tile: (tile) => this.#tiles.queueTile(tile as Tile),
    });

    const objects = this.#objectMap.objects,
      growthId = (city: PlainObject | undefined): string | undefined =>
        city?.growth?.['#ref'],
      growthNow = (city: PlainObject | undefined): PlainObject | undefined => {
        const id = growthId(city);

        return id === undefined ? undefined : objects[id];
      },
      growthBefore = (
        city: PlainObject | undefined
      ): PlainObject | undefined => {
        const id = growthId(city);

        return id !== undefined && before.has(id)
          ? before.get(id)
          : growthNow(city);
      };

    // A growth sent without its city: the city is found among your own, as
    //  only theirs have a growth of their own.
    cityIds.forEach((cityId) => {
      const id = growthId(objects[cityId]);

      if (id !== undefined) {
        growthIds.delete(id);
      }
    });

    if (growthIds.size > 0) {
      (this.#data.player?.cities ?? []).forEach((city) => {
        if (growthIds.has(city?.growth?.id)) {
          cityIds.add(city.id);
        }
      });
    }

    cityIds.forEach((id) => {
      const city = objects[id],
        previous = before.has(id) ? before.get(id) : city,
        drawn = drawnCity(city, growthNow(city));

      if (
        drawn === null ||
        drawn === drawnCity(previous, growthBefore(previous))
      ) {
        return;
      }

      queueTiles(city.tile, previous?.tile);
    });

    tileIds.forEach((id) => {
      const tile = this.#objectMap.objects[id];

      if (typeof tile?.x === 'number' && typeof tile?.y === 'number') {
        this.#tiles.queueTile(tile as Tile);
      }
    });

    if (this.#waitingForTurn) {
      this.#scheduleUpdate();

      return;
    }

    this.update();
  }

  /**
   * A `gameData` after the first: a map that did not come from patches, whose changes are not known. It becomes the
   * map later patches apply to and later updates rebuild from; rebuilding from it once while patching the old one
   * undid it at the next patch. The prunes start again from it, as they did from the first map: its size is the new
   * baseline (measured against the old map's, a bigger one was pruned straight away for having grown), and the turn
   * last pruned is forgotten too, so on a 5th turn already pruned a map over 5,000 objects is pruned once more.
   */
  replace(objectMap: ObjectMap): void {
    this.#objectMap = objectMap;
    this.#objectCount = Object.keys(objectMap.objects).length;
    this.#pruneSchedule = new PruneSchedule(this.#objectCount);

    this.#update(objectMap, true);
  }

  /** Rebuilds what the patches since the last update changed, then runs the `onUpdated` callback. */
  update(): void {
    this.#update(this.#objectMap);
  }

  dispose(): void {
    this.#cancelUpdate();
  }

  #cancelUpdate(): void {
    if (this.#stateFrame !== null) {
      this.#frames.cancel(this.#stateFrame);

      this.#stateFrame = null;
    }
  }

  #scheduleUpdate(): void {
    if (this.#stateFrame !== null) {
      return;
    }

    this.#stateFrame = this.#frames.request(() => {
      this.#stateFrame = null;

      this.update();
    });
  }

  // `rebuildAll` is for a map that did not come from patches.
  #update(objectMap: ObjectMap, rebuildAll = false): void {
    const changed = rebuildAll ? null : this.#changedIds;

    this.#changedIds = new Set();

    // TODO: look into if it's possible to have data reconstituted in a worker thread
    this.#data = this.#reconstituter.rebuild(objectMap, changed) as GameData;

    // Accumulated until the next render's `notify`: several rebuilds can come
    //  between two renders, and `filledIds` is the last one's alone. It adds
    //  the owners of refs that have just arrived.
    this.#changes.collect(
      changed === null ? null : [...changed, ...this.#reconstituter.filledIds()]
    );

    const turnValue = Number(this.#data?.turn?.value ?? 0),
      objectCount = this.#objectCount;

    this.#currentTurn = turnValue;
    this.#currentObjectCount = objectCount;

    if (this.#pruneSchedule.due(turnValue, objectCount)) {
      const removedIds = pruneObjectMap(objectMap);

      this.#objectCount -= removedIds.length;
      this.#reconstituter.forget(removedIds);
      this.#pruneSchedule.pruned(turnValue, this.#objectCount);
    }

    // Refilled when a patch re-sent the world, as it does for a tile newly
    //  seen. The tiles keep their objects otherwise, so the lookup stays as it
    //  is. Read before anything else can rebuild: `refilled` is the last
    //  rebuild's alone.
    this.#tiles.setTiles(
      this.#data.player.world.tiles,
      this.#reconstituter.refilled(this.#data.player.world.id)
    );

    this.#updated();
  }
}

export default GameState;
