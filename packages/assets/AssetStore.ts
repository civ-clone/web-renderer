import { Record, Store } from '@civ-clone/ui-platform/Store';
import {
  AssetPack,
  HostedSheet,
  PackMetadata,
  SheetIndex,
  metadataKey,
} from './lib/packs';
import { TilesetDescriptor, spriteKey } from './tilesets/TilesetDescriptor';
import civ1Adlib from './sounds/civ1-adlib.json';
import { soundFileKey } from './sounds/SoundDescriptor';
import { interfaceTileset } from './lib/tilesets';
import { imageSize } from './lib/imageSize';
import scaleImage from './lib/scaleImage';
import { setSprites } from './lib/getPreloadedImage';

/** How many times a sprite `spriteWidth` px wide is enlarged to be shown `width` px wide: 1 for one that isn't loaded. */
export const shownAtScale = (spriteWidth: number, width: number): number =>
  spriteWidth > 0 ? Math.max(1, Math.ceil(width / spriteWidth)) : 1;

/**
 * An imported sprite, kept as its PNG (#730). Imports from before that kept it as a data URI in `uri`, which `load`
 * turns into a `blob` the first time it reads one.
 */
export interface Asset extends Record {
  name: string;
  blob?: Blob;
  uri?: string;
}

// `blob` as an `<img>`, once it has loaded: the `load` event comes in a hidden tab too, where an `<img>`'s `decode()`
//  never settles.
const imageFrom = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = document.createElement('img'),
      url = URL.createObjectURL(blob);

    image.addEventListener(
      'load',
      () => {
        URL.revokeObjectURL(url);
        resolve(image);
      },
      { once: true }
    );
    image.addEventListener(
      'error',
      () => {
        URL.revokeObjectURL(url);
        reject(new Error('The image could not be loaded.'));
      },
      { once: true }
    );
    image.src = url;
  });

/**
 * `blob` decoded to draw from: a bitmap, or, if one hasn't come within `timeout` ms, an `<img>`. `Renderer.init` waits
 *  for every sprite, so a decode that never settled, as `decode()` doesn't in a background tab, would stop the game
 *  starting there (#730).
 */
export const decodeSprite = async (
  blob: Blob,
  timeout: number = 5000
): Promise<CanvasImageSource> => {
  let timer: ReturnType<typeof setTimeout> | undefined,
    timedOut = false;

  // Called inside a promise, so a browser that throws at once (no support) rejects like a failed decode.
  const decoding = Promise.resolve().then(() => createImageBitmap(blob)),
    late = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve(null);
      }, timeout);
    }),
    bitmap = await Promise.race([decoding, late]).finally(() =>
      clearTimeout(timer)
    );

  if (bitmap !== null) {
    return bitmap;
  }

  // A bitmap that comes after all isn't used: its memory is given back.
  decoding.then(
    (lateBitmap) => timedOut && lateBitmap.close(),
    () => {}
  );

  return imageFrom(blob);
};

/** How long a hosted set's sheet is waited for, in ms, fetched, decoded and cut up, before it's given up on (#1063). */
export const HOSTED_TIMEOUT = 15000;

/**
 * What `work` makes, given a signal that aborts once `timeout` ms have gone: rejects, naming `what`, if it hasn't
 *  finished by then, so a request that hangs, or a decode that does, doesn't hold up whatever waits on it. `doing`
 *  says what it was still doing then, where it has more than one step (#1114).
 */
const withinTime = async <T>(
  what: string,
  timeout: number,
  work: (signal: AbortSignal) => Promise<T>,
  doing: () => string | null = () => null
): Promise<T> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const step = doing();

          controller.abort();
          reject(
            new Error(
              `${what} didn't come within ${timeout} ms${
                step === null ? '' : `: it was still ${step}`
              }.`
            )
          );
        }, timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

// What `read` makes of the response to fetching `url`, once it has said it's there.
const fetched = async <T>(
  url: string,
  read: (response: Response) => Promise<T>,
  signal?: AbortSignal
): Promise<T> => {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`${url} couldn't be fetched (${response.status}).`);
  }

  return read(response);
};

/**
 * What `read` makes of the response to fetching `url`, a hosted set's sheet or index (#1063), once it has come, said
 *  it's there, and been read whole. Rejects for one that isn't all there within `timeout` ms, its body too.
 */
export const fetchHosted = <T>(
  url: string,
  read: (response: Response) => Promise<T>,
  timeout: number = HOSTED_TIMEOUT
): Promise<T> =>
  withinTime(url, timeout, (signal) => fetched(url, read, signal));

/**
 * The sprite at `rectangle` in `sheet`, a hosted set's decoded sheet (#1063), as an image of its own, its own size. A
 *  bitmap is cut as one; an `<img>` (`decodeSprite`'s way in a background tab) is cut onto a canvas, which needs no
 *  decoding to wait for.
 */
export const cutSprite = async (
  sheet: CanvasImageSource,
  { x, y, width, height }: SheetIndex['sprites'][string]
): Promise<CanvasImageSource> => {
  if (!(sheet instanceof HTMLImageElement)) {
    return createImageBitmap(sheet as ImageBitmapSource, x, y, width, height);
  }

  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;
  canvas
    .getContext('2d')!
    .drawImage(sheet, x, y, width, height, 0, 0, width, height);

  return canvas;
};

// Whether `index` is a hosted set's index for `id`: its sprites' rectangles, each whole pixels inside the sheet.
const isSheetIndex = (index: unknown, id: string): index is SheetIndex => {
  const {
    id: indexId,
    width,
    height,
    sprites,
  } = (index ?? {}) as Partial<SheetIndex>;

  return (
    indexId === id &&
    typeof width === 'number' &&
    typeof height === 'number' &&
    typeof sprites === 'object' &&
    sprites !== null &&
    Object.values(sprites).every(
      (rectangle) =>
        typeof rectangle === 'object' &&
        rectangle !== null &&
        [rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(
          Number.isInteger
        ) &&
        rectangle.x >= 0 &&
        rectangle.y >= 0 &&
        rectangle.width > 0 &&
        rectangle.height > 0 &&
        rectangle.x + rectangle.width <= width &&
        rectangle.y + rectangle.height <= height
    )
  );
};

/**
 * The sprites of `pack`, a hosted set (#1063), by key (`spriteKey`), as `hosted` serves them: its sheet and its index
 *  fetched, the sheet decoded (`decodeSprite`), and each sprite the pack lists cut out of it (`cutSprite`), all within
 *  `timeout` ms. Nothing is read from or written to the browser's storage, so it loads with storage blocked (#850).
 *  Rejects when the sheet or its index can't be fetched or read in time; a sprite the index doesn't have is left out,
 *  and drawn as missing.
 */
export const loadHosted = (
  pack: AssetPack,
  hosted: HostedSheet,
  timeout: number = HOSTED_TIMEOUT
): Promise<Map<string, CanvasImageSource>> => {
  // What it's doing, for a timeout to say which step held it up (#1114).
  const step = { doing: 'being fetched' };

  return withinTime(
    `The ${pack.id} set's sheet`,
    timeout,
    (signal) => cutHosted(pack, hosted, signal, step),
    () => step.doing
  );
};

const cutHosted = async (
  pack: AssetPack,
  { sheet, index }: HostedSheet,
  signal: AbortSignal,
  step: { doing: string }
): Promise<Map<string, CanvasImageSource>> => {
  const [blob, json] = await Promise.all([
    fetched(sheet, (response) => response.blob(), signal),
    fetched(index, (response): Promise<unknown> => response.json(), signal),
  ]);

  if (!isSheetIndex(json, pack.id)) {
    throw new TypeError(`${index} is not the ${pack.id} set's index.`);
  }

  step.doing = 'being decoded';

  const image = await decodeSprite(blob),
    loaded = new Map<string, CanvasImageSource>();

  step.doing = 'being cut up';

  try {
    await Promise.all(
      [...pack.assets.required, ...pack.assets.optional]
        .filter((name) =>
          Object.prototype.hasOwnProperty.call(json.sprites, name)
        )
        .map(async (name) => {
          loaded.set(
            spriteKey(pack, name),
            await cutSprite(image, json.sprites[name]!)
          );
        })
    );
  } finally {
    // Each sprite is its own image now: the sheet's memory is given back.
    if (typeof (image as ImageBitmap).close === 'function') {
      (image as ImageBitmap).close();
    }
  }

  return loaded;
};

/** A sprite the extractor gave as a data URI, as the store keeps it. */
export const assetFromURI = async (
  name: string,
  uri: string
): Promise<Asset> => ({
  name,
  blob: await (await fetch(uri)).blob(),
});

/**
 * The key the player's ASOUND.CVL is kept under, as the file itself (#126): not a sprite, so it's never in the
 *  tileset's counts. From the music's manifest's `storage` (#1106), which the library registers.
 */
export const SOUND_DRIVER = soundFileKey(civ1Adlib, 'ASOUND.CVL');

// The keys of every sprite `pack` lists, required and optional.
const requiredKeys = (pack: AssetPack): string[] =>
    pack.assets.required.map((name) => spriteKey(pack, name)),
  optionalKeys = (pack: AssetPack): string[] =>
    pack.assets.optional.map((name) => spriteKey(pack, name));

export class AssetStore extends Store<{
  assets: {
    key: string;
    value: Asset;
  };
}> {
  #cachedAssets = new Map<string, Asset>();
  #cachedScaledImages = new Map<string, HTMLCanvasElement>();
  #cachedURLs = new Map<string, string>();
  #loaded = new Map<string, CanvasImageSource>();
  #metadata = new Map<string, PackMetadata>();
  // The hosted sets' sprites, by set id, once each one's sheet has loaded (`loadHostedPack`), and each one loading.
  #hosted = new Map<string, Map<string, CanvasImageSource>>();
  #hostedLoading = new Map<string, Promise<void>>();
  #loads = 0;
  // The packs loaded beside the store's own tileset.
  #others: AssetPack[] = [];
  #ready: Promise<void> = Promise.resolve();
  // Undefined until it is first asked for, for the store made as the page loads (`assetStore`): Civ1's, the pack
  //  registered as the interface's, which its package registers once this module has been loaded (`registerTileset`).
  //  Only what the store loads first and counts by default: nothing waits on it to play since #1063.
  #tileset: TilesetDescriptor | undefined;

  /**
   * The store for `tileset`'s sprites: it is ready when every sprite the tileset requires has been imported, and keeps
   * each under the tileset's key for it (`spriteKey`). `packs` are loaded beside it (#97), such as the pack the map is
   * drawn with when that isn't the interface's: their sprites are drawn when they are there, and the store is ready
   * without them. Without a `tileset`, Civ1's (`interfaceTileset`), as it is when the store is first used.
   */
  constructor(tileset?: TilesetDescriptor, packs: AssetPack[] = []) {
    super('civ-clone-assets', 'assets', {
      keyPath: 'name',
    });

    this.#tileset = tileset;

    packs.forEach((pack) => this.addPack(pack));
  }

  /** The store's own tileset: the one it was made for, or Civ1's. */
  #ownTileset(): TilesetDescriptor {
    this.#tileset ??= interfaceTileset();

    return this.#tileset;
  }

  /** The packs `load` decodes the sprites of: the store's own tileset first. */
  get packs(): AssetPack[] {
    return [this.#ownTileset(), ...this.#others];
  }

  /** Loads `pack`'s sprites as well from the next `load` on (#97), once: the same pack again is left as it is. */
  addPack(pack: AssetPack): void {
    if (!this.packs.some(({ id }) => id === pack.id)) {
      this.#others.push(pack);
    }
  }

  /** The keys of the sprites the store cannot be used without, in the order the tileset lists them. */
  get requiredAssets(): string[] {
    return requiredKeys(this.#ownTileset());
  }

  /** The keys of the sprites drawn when there, which an import from before they existed may not have. */
  get optionalAssets(): string[] {
    return optionalKeys(this.#ownTileset());
  }

  /** Settles once the last `load` has decoded every sprite it could: until then, nothing is drawn from them. */
  get ready(): Promise<void> {
    return this.#ready;
  }

  /**
   * Decodes the sprites of the store's packs, and only theirs (#730), for the map and the interface to draw from, and
   * reads what each pack's import says about them (`metadata`). One that cannot be decoded is left out and drawn as
   * missing, rather than holding the game up. A hosted set's sprites (#1063) aren't fetched here, but once something
   * is to draw from them (`loadHostedPack`), and are kept from one load to the next.
   */
  load(): Promise<void> {
    // Never rejects: if the store can't be read, the game goes on without the sprites, so the main menu and the import
    //  are still there, and whatever waits on `ready` isn't failed by it.
    this.#ready = this.#load().catch((error) =>
      console.error('Could not load the assets.', error)
    );

    return this.#ready;
  }

  async #load(): Promise<void> {
    const load = ++this.#loads,
      loaded = new Map<string, CanvasImageSource>(),
      metadata = new Map<string, PackMetadata>();

    // A store that can't be read leaves the imported packs' sprites out, and not the hosted sets' loaded already.
    await this.#loadImported(loaded, metadata).catch((error) =>
      console.error('Could not load the assets.', error)
    );

    // A later load has started since: its sprites are the ones to draw (#152 loads another tileset on a switch).
    if (load !== this.#loads) {
      return;
    }

    this.#cachedAssets.clear();
    this.#cachedScaledImages.clear();
    this.#cachedURLs.clear();
    this.#metadata = metadata;
    this.#show(loaded);
  }

  // Draws from `loaded`, the imported packs' sprites, and the hosted sets' that have loaded.
  #show(loaded: Map<string, CanvasImageSource>): void {
    this.#hosted.forEach((sprites) =>
      sprites.forEach((image, key) => loaded.set(key, image))
    );
    this.#loaded = loaded;
    setSprites(loaded);
  }

  /**
   * Fetches `pack`'s sheet, a hosted set's (#1063), and draws from its sprites from then on: once, however often it's
   *  asked, until it fails, when it can be asked again. Rejects, saying why, when the sheet can't be loaded within
   *  `timeout` ms (`loadHosted`). Resolves at once for a pack that isn't hosted.
   */
  loadHostedPack(
    pack: AssetPack,
    timeout: number = HOSTED_TIMEOUT
  ): Promise<void> {
    const { id, hosted } = pack;

    if (hosted === undefined || this.#hosted.has(id)) {
      return Promise.resolve();
    }

    const loading =
      this.#hostedLoading.get(id) ??
      loadHosted(pack, hosted, timeout).then(
        (sprites) => {
          this.#hosted.set(id, sprites);
          this.#hostedLoading.delete(id);
          // What's drawn from already, and this set's sprites beside it.
          this.#show(new Map(this.#loaded));
        },
        (error) => {
          this.#hostedLoading.delete(id);

          throw error;
        }
      );

    this.#hostedLoading.set(id, loading);

    return loading;
  }

  /** Whether `pack`'s sheet, a hosted set's, has loaded (`loadHostedPack`). */
  hostedLoaded({ id }: Pick<AssetPack, 'id'>): boolean {
    return this.#hosted.has(id);
  }

  // The sprites of the packs the player imports, from the browser's storage, into `loaded`, and what each one's import
  //  said about them into `metadata`.
  async #loadImported(
    loaded: Map<string, CanvasImageSource>,
    metadata: Map<string, PackMetadata>
  ): Promise<void> {
    const imported = this.packs.filter(({ hosted }) => hosted === undefined),
      // Each pack's keys are its own (`spriteKey`), so the sprites of all of them are drawn from the one lookup.
      keys = new Set(
        imported.flatMap((pack) => [
          ...requiredKeys(pack),
          ...optionalKeys(pack),
        ])
      ),
      records = (
        await Promise.all([...keys].map((key) => super.get(key)))
      ).filter((record): record is Asset => record !== undefined),
      // Imported before #730, as a data URI: kept as its PNG from now on. One that can't be read is left out, and drawn
      //  as missing, rather than stopping the game before the player can import again.
      migrated = (
        await Promise.all(
          records
            .filter(({ blob, uri }) => blob === undefined && uri !== undefined)
            .map(({ name, uri }) =>
              assetFromURI(name, uri!).catch((error) => {
                console.error(`Could not read ${name}.`, error);

                return null;
              })
            )
        )
      ).filter((asset): asset is Asset => asset !== null);

    if (migrated.length > 0) {
      // Still drawn from this time if they can't be stored: they are converted again next time.
      await this.setAll(migrated).catch((error) =>
        console.error('Could not store the converted assets.', error)
      );
    }

    const blobs = [...records, ...migrated].filter(
      (record): record is Asset & { blob: Blob } => record.blob !== undefined
    );

    await Promise.all([
      ...blobs.map(async ({ name, blob }) => {
        try {
          loaded.set(name, await decodeSprite(blob));
        } catch (error) {
          console.error(`Could not decode ${name}.`, error);
        }
      }),
      // Only a pack whose import keeps a record of its sprites' anchors has one to read: Civ1's doesn't.
      ...imported
        .filter(({ metadata }) => metadata === true)
        .map(async (pack) => {
          try {
            const packMetadata = await this.readMetadata(pack);

            if (packMetadata !== null) {
              metadata.set(pack.id, packMetadata);
            }
          } catch (error) {
            // Its sprites are drawn without their anchors, at the tile's own, until it is imported again.
            console.error(`Could not read ${metadataKey(pack)}.`, error);
          }
        }),
    ]);
  }

  /**
   * What `pack`'s import said about its sprites (#97), their anchors and its flag colours, as the last `load` read it,
   * or null for a pack that isn't loaded or whose import said nothing.
   */
  metadata(pack: Pick<AssetPack, 'id'>): PackMetadata | null {
    return this.#metadata.get(pack.id) ?? null;
  }

  /**
   * What `pack`'s import said about its sprites, read from the store, or null when it has said nothing. Rejects when
   *  the record is there but can't be read, so an import doesn't take it for nothing and write a part over it.
   */
  async readMetadata(
    pack: Pick<AssetPack, 'storage'>
  ): Promise<PackMetadata | null> {
    const record: Asset | undefined = await super.get(metadataKey(pack));

    if (!record?.blob) {
      return null;
    }

    const metadata = JSON.parse(await record.blob.text());

    if (
      typeof metadata?.anchors !== 'object' ||
      metadata.anchors === null ||
      typeof metadata.colours !== 'object' ||
      metadata.colours === null
    ) {
      throw new TypeError(`${metadataKey(pack)} is not a pack's metadata.`);
    }

    return metadata;
  }

  override async get(path: string): Promise<Asset> {
    if (!this.#cachedAssets.has(path)) {
      this.#cachedAssets.set(path, (await super.get(path))!);
    }

    return this.#cachedAssets.get(path)!;
  }

  // The first of `paths` that has been imported, or loaded from a hosted set's sheet (#1063), or the last of them if
  //  none has. Lets a sprite added to the extractor fall back to an older one for assets imported before it existed.
  async firstImported(paths: string[]): Promise<string> {
    await this.#ready;

    for (const path of paths) {
      if (this.#loaded.has(path) || (await this.get(path).catch(() => null))) {
        return path;
      }
    }

    // Its callers always name at least one path.
    return paths[paths.length - 1]!;
  }

  async getScaled(path: string, scale: number): Promise<HTMLCanvasElement> {
    await this.#ready;

    // Keyed on the scale as well as the path: the same asset at a different
    // scale is a different canvas, and keying on the path alone silently
    // served the first scale asked for to every later caller.
    const key = `${path}@${scale}`,
      image = this.#loaded.get(path);

    if (image === undefined) {
      // Not imported: something drawable and minimal, and not kept, so an import is used once it is loaded.
      const missing = document.createElement('canvas');

      missing.width = 1;
      missing.height = 1;

      return missing;
    }

    if (!this.#cachedScaledImages.has(key)) {
      this.#cachedScaledImages.set(key, scaleImage(image, scale));
    }

    return this.#cachedScaledImages.get(key)!;
  }

  /**
   * The sprite at `path` enlarged to be shown `width` CSS px wide (#729): by the whole number of times that reaches it,
   *  and not at all when it is already that wide or wider, for CSS to show at `width`.
   */
  async getShownAt(path: string, width: number): Promise<HTMLCanvasElement> {
    await this.#ready;

    const image = this.#loaded.get(path);

    return this.getScaled(
      path,
      shownAtScale(image === undefined ? 0 : imageSize(image)[0], width)
    );
  }

  /**
   * `getShownAt`'s canvas as a URL for an `<img>`, made once per sprite and width (#730): the city screen and the
   *  reports draw the same icons on every render.
   */
  async shownAtURL(path: string, width: number): Promise<string> {
    const key = `${path}@${width}`;

    if (!this.#cachedURLs.has(key)) {
      const url = (await this.getShownAt(path, width)).toDataURL('image/png');

      if (!this.#loaded.has(path)) {
        return url;
      }

      this.#cachedURLs.set(key, url);
    }

    return this.#cachedURLs.get(key)!;
  }
  /** `shownAtURL`'s URL when it has been made already, for drawing it straight away on a re-render. */
  cachedURL(path: string, width: number): string | null {
    return this.#cachedURLs.get(`${path}@${width}`) ?? null;
  }

  /** The sprite at `path` at its own size, as a URL for an `<img>`, made once: the action panels' buttons. */
  spriteURL(path: string): Promise<string> {
    return this.shownAtURL(path, 1);
  }

  /** Whether the sprite at `path` was imported, for one that's optional: drawn when it's there, left out when not. */
  async has(path: string): Promise<boolean> {
    await this.#ready;

    return this.#loaded.has(path);
  }

  // What the store holds, by key, or nothing when the browser won't open it (#850): a store that can't be read holds
  //  nothing as far as the game can tell, so the menus, the cursor and the music start as they do before anything
  //  has been imported. `load` has already logged why.
  async #imported(): Promise<string[]> {
    try {
      return await this.keys();
    } catch {
      return [];
    }
  }

  /**
   * Whether the browser lets the store be opened at all. With site data blocked it doesn't (#850): nothing imported
   * could be kept, which the library and each import window say before any files are chosen.
   */
  usable(): Promise<boolean> {
    return this.opens();
  }

  /**
   * How many of `pack`'s sprites, required or optional, are imported: for Options to say of the store's own tileset
   *  (#749).
   */
  async importedCount(pack: AssetPack = this.#ownTileset()): Promise<number> {
    const dbAssets = new Set(await this.#imported());

    return [...requiredKeys(pack), ...optionalKeys(pack)].filter((asset) =>
      dbAssets.has(asset)
    ).length;
  }

  /** The ASOUND.CVL the player imported, as its bytes, or null without one (#126). */
  async soundDriver(): Promise<ArrayBuffer | null> {
    try {
      const record: Asset | undefined = await super.get(SOUND_DRIVER);

      return record?.blob ? await record.blob.arrayBuffer() : null;
    } catch {
      // A store that can't be read has no sound driver to give (#850).
      return null;
    }
  }

  /** Whether an ASOUND.CVL has been imported, for Options to offer the volume. */
  async hasSoundDriver(): Promise<boolean> {
    return (await this.#imported()).includes(SOUND_DRIVER);
  }

  /**
   * Whether every sprite `pack` requires has been imported: by default the store's own tileset, without which the game
   *  doesn't start. Another pack is complete or not on its own (#97).
   */
  async hasAllAssets(pack: AssetPack = this.#ownTileset()): Promise<boolean> {
    return (await this.missingAssets(pack)).length === 0;
  }

  /**
   * Whether every sprite `pack` requires has been imported, or null when the store opens but can't be read to say:
   *  unlike `hasAllAssets`, which takes any store that can't be read for one with nothing in it. A store the browser
   *  won't open at all (site data blocked, #850) has nothing imported, so nothing is complete. For a hosted set
   *  (#1063), whether its sheet has loaded with every one.
   */
  async isComplete(
    pack: AssetPack = this.#ownTileset()
  ): Promise<boolean | null> {
    if (pack.hosted !== undefined) {
      return (await this.missingAssets(pack)).length === 0;
    }

    let stored: Set<string>;

    try {
      stored = new Set(await this.keys());
    } catch {
      // Blocked, there is nothing imported; open, a read that failed for a passing reason says nothing.
      return (await this.opens()) ? null : false;
    }

    return requiredKeys(pack).every((key) => stored.has(key));
  }

  /**
   * The keys of the sprites `pack` requires that haven't been imported: by default, the store's own tileset's. For a
   *  hosted set (#1063), those not cut from its sheet: all of them until it has loaded (`loadHostedPack`).
   */
  async missingAssets(pack: AssetPack = this.#ownTileset()): Promise<string[]> {
    if (pack.hosted !== undefined) {
      const sprites = this.#hosted.get(pack.id);

      return requiredKeys(pack).filter((key) => !sprites?.has(key));
    }

    const dbAssets = new Set(await this.#imported());

    return requiredKeys(pack).filter(
      (requiredAsset) => !dbAssets.has(requiredAsset)
    );
  }
}

export const assetStore = new AssetStore();
