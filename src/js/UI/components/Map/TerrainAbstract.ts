import { NeighbourDirection, Tile } from '../../types';
import { Map, IMap } from '../Map';
import { SpriteFamily, expandName } from '../../tilesets/TilesetDescriptor';

export class TerrainAbstract extends Map implements IMap {
  update(tilesToUpdate: Tile[]): void {
    // A tile's terrain joins up with its neighbours', so they are drawn again too, each of them once. Told apart by
    //  where they are, as the tiles an update names aren't the world's own objects and an unseen tile is a new object
    //  each time it is asked for: comparing objects drew most tiles of a whole-map update (a change of government)
    //  twice and unseen ones up to eight times, after comparing every tile with every other (#488).
    const world = this.world(),
      directions = world.topology().directions(),
      seen = new Set<string>(),
      extendedTilesToUpdate: Tile[] = [],
      add = ({ x, y }: Tile): void => {
        const tile = world.get(x, y),
          key = `${tile.x},${tile.y}`;

        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        extendedTilesToUpdate.push(tile);
      };

    tilesToUpdate.forEach(add);

    tilesToUpdate.forEach((tile) =>
      directions.forEach((direction) =>
        add(world.getNeighbour(tile, direction))
      )
    );

    return super.update(extendedTilesToUpdate);
  }

  /**
   * Draws `family` for a tile whose neighbours in the `matched` directions match, as the tileset puts it together
   * (#92): one sprite named for all of them (`bitmask`), one for each (`edges`), or just the sprite (no method).
   * `values` fill the sprite name's other placeholders. When a family that joins its neighbours has none matched, its
   * `isolated` sprite or dot is drawn instead, unless `drawIsolated` is false.
   */
  protected drawFamily(
    family: SpriteFamily,
    matched: readonly NeighbourDirection[],
    values: { [placeholder: string]: string },
    offsetX: number,
    offsetY: number,
    drawIsolated: boolean = true
  ): void {
    if (family.method === 'edges') {
      matched.forEach((dir) =>
        this.drawImage(
          expandName(family.sprite, { ...values, dir }),
          offsetX,
          offsetY
        )
      );
    }

    if (family.method === 'bitmask' && matched.length > 0) {
      this.drawImage(
        expandName(family.sprite, {
          ...values,
          dirs: matched.join(family.join ?? ''),
        }),
        offsetX,
        offsetY
      );
    }

    if (family.method === undefined) {
      this.drawImage(expandName(family.sprite, values), offsetX, offsetY);
    }

    if (
      family.method === undefined ||
      matched.length > 0 ||
      !drawIsolated ||
      !family.isolated
    ) {
      return;
    }

    if (typeof family.isolated === 'string') {
      this.drawImage(expandName(family.isolated, values), offsetX, offsetY);

      return;
    }

    this.drawDot(family.isolated, offsetX, offsetY);
  }

  /** A square of `dot`'s colour, `size` native px across, in the middle of the tile. */
  protected drawDot(
    { dot, size }: { dot: string; size: number },
    offsetX: number,
    offsetY: number
  ): void {
    const side = size * this.scale(),
      center = Math.floor(this.tileSize() / 2) - Math.floor(side / 2);

    this.context().fillStyle = dot;
    // `rect()` without a `beginPath()` appends to the path the last tile
    // left behind, so every `fill()` used to re-fill every dot drawn so far.
    this.context().beginPath();
    this.context().rect(offsetX + center, offsetY + center, side, side);
    this.context().fill();
  }

  /** The directions `family` looks at, as the world's topology names them: the ones sharing an edge, or all of them. */
  protected familyDirections({
    neighbours,
  }: SpriteFamily): readonly NeighbourDirection[] {
    const topology = this.world().topology();

    return neighbours === 'all'
      ? topology.directions()
      : topology.edgeDirections();
  }
}

export default TerrainAbstract;
