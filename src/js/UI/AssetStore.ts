import { Record, Store } from './Store';
import { TilesetDescriptor, spriteKey } from './tilesets/TilesetDescriptor';
import currentTileset from './lib/tilesets';
import { imageSize, isDrawable } from './lib/imageSize';
import scaleImage from './lib/scaleImage';

/** How many times a sprite `spriteWidth` px wide is enlarged to be shown `width` px wide: 1 for one that isn't loaded. */
export const shownAtScale = (spriteWidth: number, width: number): number =>
  spriteWidth > 0 ? Math.max(1, Math.ceil(width / spriteWidth)) : 1;

interface Asset extends Record {
  name: string;
  uri: string;
}

export class AssetStore extends Store<{
  assets: {
    key: string;
    value: Asset;
  };
}> {
  #cachedAssets = new Map<string, Asset>();
  #cachedImages = new Map<string, HTMLImageElement>();
  #cachedScaledImages = new Map<string, HTMLCanvasElement>();
  #optionalAssets: string[];
  #requiredAssets: string[];

  /**
   * The store for `tileset`'s sprites: it is ready when every sprite the tileset requires has been imported, and keeps
   * each under the tileset's key for it (`spriteKey`).
   */
  constructor(tileset: TilesetDescriptor = currentTileset()) {
    super('civ-clone-assets', 'assets', {
      keyPath: 'name',
    });

    this.#requiredAssets = tileset.assets.required.map((name) =>
      spriteKey(tileset, name)
    );
    this.#optionalAssets = tileset.assets.optional.map((name) =>
      spriteKey(tileset, name)
    );
  }

  /** The keys of the sprites the store cannot be used without, in the order the tileset lists them. */
  get requiredAssets(): string[] {
    return [...this.#requiredAssets];
  }

  /** The keys of the sprites drawn when there, which an import from before they existed may not have. */
  get optionalAssets(): string[] {
    return [...this.#optionalAssets];
  }

  async get(path: string): Promise<Asset> {
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

    return paths[paths.length - 1];
  }

  async getImage(path: string): Promise<HTMLImageElement> {
    if (!this.#cachedImages.has(path)) {
      const asset = await this.get(path),
        image = document.createElement('img')!;

      image.src = asset.uri;

      // This element is never appended, so it is never rendered and its
      // intrinsic size only arrives once it has loaded — and callers size
      // canvases from it. Without the wait, `scaleImage` reads a width of 0.
      //
      // Deliberately the `load` event rather than `decode()`: for an element
      // that is not in the document, `decode()` never settles while the page
      // is hidden, and this is awaited during `Renderer.init`, so using it
      // stops the app starting at all in a background tab.
      const loaded = await new Promise<boolean>((resolve) => {
        if (image.complete) {
          resolve(image.naturalWidth > 0);

          return;
        }

        image.addEventListener('load', () => resolve(true), { once: true });
        image.addEventListener('error', () => resolve(false), { once: true });
      });

      if (!loaded) {
        // Leave a broken image uncached so a later import can replace it,
        // rather than serving the failure for the rest of the session.
        return image;
      }

      this.#cachedImages.set(path, image);
    }

    return this.#cachedImages.get(path)!;
  }

  async getScaled(path: string, scale: number): Promise<HTMLCanvasElement> {
    // Keyed on the scale as well as the path: the same asset at a different
    // scale is a different canvas, and keying on the path alone silently
    // served the first scale asked for to every later caller.
    const key = `${path}@${scale}`;

    if (!this.#cachedScaledImages.has(key)) {
      const image = await this.getImage(path);

      if (!isDrawable(image)) {
        // Scaling an undecoded image gives a blank canvas; caching that would
        // serve it for the rest of the session instead of retrying.
        return scaleImage(image, scale);
      }

      this.#cachedScaledImages.set(key, scaleImage(image, scale));
    }

    return this.#cachedScaledImages.get(key)!;
  }

  /**
   * The sprite at `path` enlarged to be shown `width` CSS px wide (#729): by the whole number of times that reaches it,
   *  and not at all when it is already that wide or wider, for CSS to show at `width`.
   */
  async getShownAt(path: string, width: number): Promise<HTMLCanvasElement> {
    return this.getScaled(
      path,
      shownAtScale(imageSize(await this.getImage(path))[0], width)
    );
  }

  async hasAllAssets(): Promise<boolean> {
    return (await this.missingAssets()).length === 0;
  }

  async missingAssets(): Promise<string[]> {
    const dbAssets = await this.keys();

    return this.#requiredAssets.filter(
      (requiredAsset) => !dbAssets.includes(requiredAsset)
    );
  }
}

export const assetStore = new AssetStore();
