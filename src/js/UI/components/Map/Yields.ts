import Map from '../Map';
import { Tile } from '../../types';

export class Yields extends Map {
  renderTile(tile: Tile): void {
    super.renderTile(tile);

    const { x, y } = tile,
      size = this.tileSize(),
      offsetX = x * size,
      offsetY = y * size,
      total = tile.yields.reduce(
        (total, tileYield) => total + tileYield.value,
        0
      ),
      // TODO: use a more effective sort than this, this only works by luck (Food -> Production -> Trade)
      yields = tile.yields.sort(
        (a, b) => a._.charCodeAt(0) - b._.charCodeAt(0)
      );

    let i = 0;

    if (total < 5) {
      const offsets: [number, number][] = [
        [offsetX, offsetY],
        [offsetX + size / 2, offsetY],
        [offsetX, offsetY + size / 2],
        [offsetX + size / 2, offsetY + size / 2],
      ];

      yields.forEach((tileYield) => {
        for (let n = 0; n < tileYield.value; n++) {
          this.putImage(
            this.getPreloadedImage(`city/${tileYield._.toLowerCase()}`),
            ...offsets[i++]
          );
        }
      });

      return;
    }

    if (total < 7) {
      const offsets: [number, number][] = [
        [offsetX, offsetY],
        [offsetX + size / 3, offsetY],
        [offsetX + (size / 3) * 2, offsetY],
        [offsetX, offsetY + size / 2],
        [offsetX + size / 3, offsetY + size / 2],
        [offsetX + (size / 3) * 2, offsetY + size / 2],
      ];

      yields.forEach((tileYield) => {
        for (let n = 0; n < tileYield.value; n++) {
          this.putImage(
            this.getPreloadedImage(`city/${tileYield._.toLowerCase()}`),
            offsets[i][0],
            offsets[i++][1]
          );
        }
      });

      return;
    }

    if (total < 9) {
      const offsets: [number, number][] = [
        [offsetX, offsetY],
        [offsetX + size / 4, offsetY],
        [offsetX + (size / 4) * 2, offsetY],
        [offsetX + (size / 4) * 3, offsetY],
        [offsetX, offsetY + size / 2],
        [offsetX + size / 4, offsetY + size / 2],
        [offsetX + (size / 4) * 2, offsetY + size / 2],
        [offsetX + (size / 4) * 3, offsetY + size / 2],
      ];

      yields.forEach((tileYield) => {
        for (let n = 0; n < tileYield.value; n++) {
          this.putImage(
            this.getPreloadedImage(`city/${tileYield._.toLowerCase()}`),
            ...offsets[i++]
          );
        }
      });

      return;
    }

    if (total < 11) {
      const offsets: [number, number][] = [
        [offsetX, offsetY],
        [offsetX + size / 5, offsetY],
        [offsetX + (size / 5) * 2, offsetY],
        [offsetX + (size / 5) * 3, offsetY],
        [offsetX + (size / 5) * 4, offsetY],
        [offsetX, offsetY + size / 2],
        [offsetX + size / 5, offsetY + size / 2],
        [offsetX + (size / 5) * 2, offsetY + size / 2],
        [offsetX + (size / 5) * 3, offsetY + size / 2],
        [offsetX + (size / 5) * 4, offsetY + size / 2],
      ];

      yields.forEach((tileYield) => {
        for (let n = 0; n < tileYield.value; n++) {
          this.putImage(
            this.getPreloadedImage(`city/${tileYield._.toLowerCase()}`),
            ...offsets[i++]
          );
        }
      });

      return;
    }

    const offsets: [number, number][] = [
      [offsetX, offsetY],
      [offsetX + size / 6, offsetY],
      [offsetX + (size / 6) * 2, offsetY],
      [offsetX + (size / 6) * 3, offsetY],
      [offsetX + (size / 6) * 4, offsetY],
      [offsetX + (size / 6) * 5, offsetY],
      [offsetX, offsetY + size / 2],
      [offsetX + size / 6, offsetY + size / 2],
      [offsetX + (size / 6) * 2, offsetY + size / 2],
      [offsetX + (size / 6) * 3, offsetY + size / 2],
      [offsetX + (size / 6) * 4, offsetY + size / 2],
      [offsetX + (size / 6) * 5, offsetY + size / 2],
    ];

    yields.forEach((tileYield) => {
      for (let n = 0; n < tileYield.value; n++) {
        this.putImage(
          this.getPreloadedImage(`city/${tileYield._.toLowerCase()}`),
          ...offsets[i++]
        );
      }
    });
  }
}
export default Yields;
