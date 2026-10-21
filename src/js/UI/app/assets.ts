import { assetStore } from '../AssetStore';
import { h } from '../lib/html';
import { s } from '@dom111/element';

// The torch cursor, once every asset has been imported.
export const setCursor = async (): Promise<void> => {
  const hasAllAssets = await assetStore.hasAllAssets();

  if (hasAllAssets) {
    const scaledCursor = await assetStore.getScaled(
      './assets/cursor/torch.png',
      2
    );

    document.body.style.cursor = `url('${scaledCursor.toDataURL(
      'image/png'
    )}'), default`;
  }
};

// preloaded the images as they could be remote
export const preloadAssets = (preloadContainer: HTMLElement): void => {
  assetStore.getAll().then((records) =>
    records.forEach((record) =>
      preloadContainer.append(
        h(
          s<HTMLImageElement>(
            `<img src="${record.uri}" data-path="${record.name}">`
          ),
          {
            error: () =>
              console.error(
                `There was a problem preloading '${record.name}', you may have some missing details.`
              ),
          }
        )
      )
    )
  );
};
