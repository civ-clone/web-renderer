import { DataPatch, GameData, Tile } from '../types';
import { ObjectMap } from '../lib/reconstituteData';
import DataChanges, { instance as sharedChanges } from '../lib/DataChanges';
import IncrementalReconstituter from '../lib/IncrementalReconstituter';
import PruneSchedule from '../lib/PruneSchedule';
import applyDataPatches from '../lib/applyDataPatches';
import pruneObjectMap from '../lib/pruneObjectMap';

// The game's data on the page (#344): the object map the worker's patches are
//  applied to, the data rebuilt from it, and when it is rebuilt. Moved out of
//  `Renderer`'s `gameData` handler; `Renderer` still decides what an update
//  means for the screen, in the `onUpdated` callback.
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
  /** Each `PlayerTile` a patch carries, once it is in the map. */
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

export class GameState {
  #changes: DataChanges;
  // Rebuilds only what the patches since the last update reached (#322):
  //  every id they added, replaced or edited in place goes here until
  //  `update` takes it, so patches coalesced while waiting for the turn are
  //  all accounted for.
  #changedIds = new Set<string>();
  #currentObjectCount: number;
  // How many objects the map holds, kept as patches add and remove them:
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
    applyDataPatches(this.#objectMap, patches, {
      changed: (id) => this.#changedIds.add(id),
      set: (id, value, previous) => {
        if (previous === undefined) {
          this.#objectCount++;
        }
      },
      removed: () => this.#objectCount--,
      // Since we only use the queued tiles for x and y this should be fine...
      tile: (tile) => this.#tiles.queueTile(tile as Tile),
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
   * undid it at the next patch.
   */
  replace(objectMap: ObjectMap): void {
    this.#objectMap = objectMap;
    this.#objectCount = Object.keys(objectMap.objects).length;

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
    //  the owners of refs that have just arrived; `changed` adds the ids
    //  removed.
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
