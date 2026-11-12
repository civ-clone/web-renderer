import {
  ActiveUnitMarker,
  GridMinimap,
} from '@civ-clone/ui-map/lib/projectionFor';
import { Map as MapLayer } from '@civ-clone/ui-map/components/Map';
import OverviewProjection from './OverviewProjection';
import Portal from '@civ-clone/ui-map/components/Portal';
import { Rect } from '@civ-clone/ui-map/lib/viewport';
import World from '@civ-clone/ui-map/components/World';
import { on } from '@dom111/element';

const wrap = (value: number, size: number): number =>
  ((value % size) + size) % size;

/**
 * The isometric grid's minimap: its `Overview`, the map's viewport as a box over it, and the active unit's brick
 * flashing. A click centres the map on the brick clicked.
 *
 * Isometric pixels are the world's tiles laid out by an affine map, the same on the map and on the overview, so the
 * map's viewport is a rectangle on the overview too: the map's pixels scaled by how far apart columns and rows are on
 * each, and moved half a brick up, since a brick is the middle of its diamond's box.
 */
export class Minimap implements GridMinimap {
  #activeUnitMarker: ActiveUnitMarker;
  #context: CanvasRenderingContext2D;
  #element: HTMLCanvasElement;
  #layer: MapLayer;
  #portal: Portal;
  #world: World;

  constructor(
    element: HTMLCanvasElement,
    world: World,
    portal: Portal,
    layer: MapLayer,
    activeUnitMarker: ActiveUnitMarker = () => null
  ) {
    this.#element = element;
    this.#world = world;
    this.#portal = portal;
    this.#layer = layer;
    this.#activeUnitMarker = activeUnitMarker;

    this.#context = this.#element.getContext('2d')!;

    on(this.#element, 'click', (event) => {
      // `offsetX`/`offsetY` are in the CSS size that was clicked, which is not the backing store's size.
      const [x, y] = this.tileAt(
        (event.offsetX / this.#element.offsetWidth) * this.#element.width,
        (event.offsetY / this.#element.offsetHeight) * this.#element.height
      );

      this.#portal.setCenter(x, y);
      this.update();
    });
  }

  /** The tile under a pixel of the overview's canvas, wrapped into the world. */
  tileAt(px: number, py: number): [number, number] {
    const [x, y] = this.projection().pixelToTile(px, py);

    return [
      wrap(x, this.#world.width()),
      Math.min(Math.max(y, 0), this.#world.height() - 1),
    ];
  }

  update(): void {
    const canvas = this.#layer.canvas();

    // The layer is drawn one to one and the element is scaled by CSS.
    if (
      this.#element.width !== canvas.width ||
      this.#element.height !== canvas.height
    ) {
      this.#element.width = canvas.width;
      this.#element.height = canvas.height;
    }

    this.#context.clearRect(0, 0, canvas.width, canvas.height);
    this.#context.drawImage(canvas, 0, 0);

    this.drawActiveUnit();
    this.drawViewport();
  }

  /** The overview's bricks, as its layer lays them out. */
  protected projection(): OverviewProjection {
    return new OverviewProjection(this.#layer.tileSize(), this.#world);
  }

  protected drawActiveUnit(): void {
    const marker = this.#activeUnitMarker();

    if (marker === null) {
      return;
    }

    // Drawn here rather than into the layer because it flashes; the caller returns `null` for the off phase.
    const projection = this.projection(),
      { width, height } = projection.footprint(),
      [px, py] = projection.tileToPixel(marker.x, marker.y),
      period = projection.wrapPeriod().x;

    this.#context.fillStyle = '#fff';

    // The last brick of an odd row runs off the right edge and comes back on the left.
    [px, px - period]
      .filter((left) => left < period && left + width > 0)
      .forEach((left) =>
        this.#context.fillRect(
          left,
          py,
          Math.max(1, width),
          Math.max(1, height)
        )
      );
  }

  protected drawViewport(): void {
    const projection = this.projection(),
      { width: columnWidth, height: rowHeight } = projection.footprint(),
      { x: periodX } = projection.wrapPeriod(),
      periodY = this.#world.height() * rowHeight,
      viewport = this.viewport(),
      // How far apart columns and rows are on the map: the overview's bricks are as far apart in their own px.
      { x: mapColumn, y: mapRow } = this.#portal.projection().tileStep(),
      scaleX = mapColumn === 0 ? 0 : columnWidth / mapColumn,
      scaleY = mapRow === 0 ? 0 : rowHeight / mapRow,
      left = Math.floor(viewport.x * scaleX),
      // A brick is the middle of its diamond's box, half a row below the box's top.
      top = Math.floor(viewport.y * scaleY - rowHeight / 2),
      boxWidth = Math.min(Math.round(viewport.width * scaleX), periodX),
      // A world that doesn't wrap over the poles is never shown past them either, whatever the portal says (the portal
      //  doesn't lock itself for one yet: docs/known-issues-and-rewrite-notes.md).
      locked =
        this.#portal.lockVerticalEdges() ||
        this.#portal.projection().wrapPeriod().y === null,
      boxTop = locked ? Math.max(0, top) : top,
      boxHeight = locked
        ? Math.min(top + Math.round(viewport.height * scaleY), periodY) - boxTop
        : Math.min(Math.round(viewport.height * scaleY), periodY),
      // The world wraps, so a box that runs off one side comes back on the other: drawn from its wrapped origin, and
      //  again a world earlier on whichever axis overflows. With the poles locked it is cut to the world's rows.
      x = wrap(left, periodX),
      y = locked ? boxTop : wrap(boxTop, periodY),
      columns = x + boxWidth > periodX ? [x, x - periodX] : [x],
      rows = !locked && y + boxHeight > periodY ? [y, y - periodY] : [y];

    if (boxWidth <= 0 || boxHeight <= 0) {
      return;
    }

    this.#context.lineWidth = 1;
    this.#context.strokeStyle = '#fff';
    this.#context.fillStyle = 'rgba(255, 255, 255, .2)';

    columns.forEach((boxX) =>
      rows.forEach((boxY) => {
        this.#context.beginPath();
        this.#context.rect(boxX, boxY, boxWidth, boxHeight);
        this.#context.stroke();
        this.#context.fill();
      })
    );
  }

  /**
   * The rectangle of the world, in the map's px, that the portal shows: its canvas, at the origin the portal scrolled
   * it to, drag included. The portal doesn't say where that is, but where it puts a tile does: a tile's box on the
   * canvas is its world px less the origin.
   *
   * TODO: ask the portal for its viewport once it has a method for it, rather than working it back from `boxOf`.
   */
  protected viewport(): Rect {
    const [worldX, worldY] = this.#portal.projection().tileToPixel(0, 0),
      box = this.#portal.boxOf({ x: 0, y: 0 }),
      { width, height } = this.#portal.canvas();

    return { x: worldX - box.x, y: worldY - box.y, width, height };
  }
}

export default Minimap;
