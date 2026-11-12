import { Attribute, Tile } from '@civ-clone/ui-protocol/types';
import { Projection, Size } from '@civ-clone/ui-map/lib/projection';
import SquareProjection from './SquareProjection';
import { Map } from '@civ-clone/ui-map/components/Map';
import { OVERVIEW_WIDTH, terrainColour } from '@civ-clone/ui-map/lib/overview';

export { OVERVIEW_WIDTH };

/**
 * The whole world at a few pixels a tile, for the minimap.
 *
 * It plots tiles in storage order, one flat square a tile, through a square
 * projection at the overview's own tile size. Each grid brings its own
 * overview (#867): the isometric grid's staggers alternate rows of bricks
 * (`map-isometric`).
 *
 * The minimap used to be three full-world layer canvases scaled down on every
 * update — 14.7 megapixels thrown into a 190px-wide target, on every patch and
 * every recentre. This draws the same information directly at the size it is
 * wanted, so an update is one small blit and a tile change repaints one tile.
 *
 * It is never composited onto the map, so it stays invisible to `Portal`; it
 * lives in the portal's layer list only so `build()` feeds it tile updates
 * alongside every other layer.
 */
export class Overview extends Map {
  #projection: Projection | null = null;

  constructor(...args: ConstructorParameters<typeof Map>) {
    super(...args);

    this.setCanvasSize();

    // Every other layer draws itself when the portal first gives it a
    // viewport, but this one ignores viewports, so it draws the world it was
    // given now. Otherwise only tiles that later arrive as patches reach it,
    // and a loaded game's minimap stays black (#270).
    this.render();
  }

  // The portal never draws this layer; it rides in the layer list only so that
  // `build()` feeds it tile updates alongside every other layer.
  override composited(): boolean {
    return false;
  }

  // Squares at the overview's own tile size, whatever projection the map has.
  protected override projection(): Projection {
    if (this.#projection === null) {
      this.#projection = new SquareProjection(this.#size(), this.world());
    }

    return this.#projection;
  }

  // Every tile is drawn as a flat square of exactly its own size, and the
  // canvas is exactly a world across, so nothing reaches past a tile and
  // nothing wraps.
  protected override overhang(): number {
    return 0;
  }

  // The whole world is the point, so this layer keeps a canvas of its own size
  // rather than taking the portal's window on the world.
  override setViewport(): void {}

  // Likewise the portal's scale — see `tileSize()` — and whether it stops at
  // the poles: the minimap always shows the world whole.
  override setScale(): void {}

  override setWrapVertical(): void {}

  // Deliberately ignores the portal's scale and tile size: the minimap is an
  // overview at its own fixed size, not a scaled view of the map.
  override tileSize(): Size {
    const size = this.#size();

    return { width: size, height: size };
  }

  // One side of the overview's square tiles.
  #size(): number {
    return Math.max(1, Math.trunc(OVERVIEW_WIDTH / this.world().width()));
  }

  protected override drawTile(
    tile: Tile,
    offsetX: number,
    offsetY: number
  ): void {
    const size = this.#size(),
      context = this.context();

    // Unexplored draws nothing rather than a default colour, so how much of the
    // world is still dark reads at a glance — which is most of what a minimap
    // is for early on.
    if (tile.terrain._ === 'Unknown') {
      return;
    }

    context.fillStyle = this.terrainColour(tile);
    context.fillRect(offsetX, offsetY, size, size);

    if (tile.city === null) {
      return;
    }

    // Cities take the owner's colour, so whose territory is where can be read
    // without opening anything.
    const [colours] = tile.city.player.civilization.attributes.filter(
      (attribute: Attribute) => attribute.name === 'colors'
    ) as { value: string[] }[];

    if (!colours) {
      return;
    }

    // Every civilization has at least one colour.
    context.fillStyle = colours.value[0]!;
    context.fillRect(offsetX, offsetY, size, size);
  }

  protected terrainColour(tile: Tile): string {
    return terrainColour(tile);
  }
}

export default Overview;
