import { Record, Store } from '@civ-clone/ui-platform/Store';
import { AssetPack, PackMetadata, metadataKey } from './lib/packs';
import { TilesetDescriptor, spriteKey } from './tilesets/TilesetDescriptor';
import currentTileset from './lib/tilesets';
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
 *  tileset's counts.
 */
export const SOUND_DRIVER = './sources/ASOUND.CVL';

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
  #optionalAssets: string[];
  #loads = 0;
  #packs: AssetPack[];
  #ready: Promise<void> = Promise.resolve();
  #requiredAssets: string[];
  #tileset: TilesetDescriptor;

  /**
   * The store for `tileset`'s sprites: it is ready when every sprite the tileset requires has been imported, and keeps
   * each under the tileset's key for it (`spriteKey`). `packs` are loaded beside it (#97), such as the pack the map is
   * drawn with when that isn't the interface's: their sprites are drawn when they are there, and the store is ready
   * without them.
   */
  constructor(
    tileset: TilesetDescriptor = currentTileset(),
    packs: AssetPack[] = []
  ) {
    super('civ-clone-assets', 'assets', {
      keyPath: 'name',
    });

    this.#tileset = tileset;
    this.#packs = [tileset];
    this.#requiredAssets = requiredKeys(tileset);
    this.#optionalAssets = optionalKeys(tileset);

    packs.forEach((pack) => this.addPack(pack));
  }

  /** The packs `load` decodes the sprites of: the store's own tileset first. */
  get packs(): AssetPack[] {
    return [...this.#packs];
  }

  /** Loads `pack`'s sprites as well from the next `load` on (#97), once: the same pack again is left as it is. */
  addPack(pack: AssetPack): void {
    if (!this.#packs.some(({ id }) => id === pack.id)) {
      this.#packs.push(pack);
    }
  }

  /** The keys of the sprites the store cannot be used without, in the order the tileset lists them. */
  get requiredAssets(): string[] {
    return [...this.#requiredAssets];
  }

  /** The keys of the sprites drawn when there, which an import from before they existed may not have. */
  get optionalAssets(): string[] {
    return [...this.#optionalAssets];
  }

  /** Settles once the last `load` has decoded every sprite it could: until then, nothing is drawn from them. */
  get ready(): Promise<void> {
    return this.#ready;
  }

  /**
   * Decodes the sprites of the store's packs, and only theirs (#730), for the map and the interface to draw from, and
   * reads what each pack's import says about them (`metadata`). One that cannot be decoded is left out and drawn as
   * missing, rather than holding the game up.
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
      // Each pack's keys are its own (`spriteKey`), so the sprites of all of them are drawn from the one lookup.
      keys = new Set(
        this.#packs.flatMap((pack) => [
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
      ),
      loaded = new Map<string, CanvasImageSource>();

    const metadata = new Map<string, PackMetadata>();

    await Promise.all([
      ...blobs.map(async ({ name, blob }) => {
        try {
          loaded.set(name, await decodeSprite(blob));
        } catch (error) {
          console.error(`Could not decode ${name}.`, error);
        }
      }),
      // Only a pack whose import keeps a record of its sprites' anchors has one to read: Civ1's doesn't.
      ...this.#packs
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

    // A later load has started since: its sprites are the ones to draw (#152 loads another tileset on a switch).
    if (load !== this.#loads) {
      return;
    }

    this.#cachedAssets.clear();
    this.#cachedScaledImages.clear();
    this.#cachedURLs.clear();
    this.#loaded = loaded;
    this.#metadata = metadata;
    setSprites(loaded);
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

  // The first of `paths` that has been imported, or the last of them if none has. Lets a sprite added to the
  //  extractor fall back to an older one for assets imported before it existed.
  async firstImported(paths: string[]): Promise<string> {
    for (const path of paths) {
      if (await this.get(path)) {
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
   * could be kept, which the Import Assets window says before any files are chosen.
   */
  usable(): Promise<boolean> {
    return this.opens();
  }

  /**
   * How many of `pack`'s sprites, required or optional, are imported: for Options to say of the store's own tileset
   *  (#749).
   */
  async importedCount(pack: AssetPack = this.#tileset): Promise<number> {
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
  async hasAllAssets(pack: AssetPack = this.#tileset): Promise<boolean> {
    return (await this.missingAssets(pack)).length === 0;
  }

  /** The keys of the sprites `pack` requires that haven't been imported: by default, the store's own tileset's. */
  async missingAssets(pack: AssetPack = this.#tileset): Promise<string[]> {
    const dbAssets = new Set(await this.#imported());

    return requiredKeys(pack).filter(
      (requiredAsset) => !dbAssets.has(requiredAsset)
    );
  }
}

export const assetStore = new AssetStore();
