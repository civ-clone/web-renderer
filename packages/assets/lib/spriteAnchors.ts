import {
  Anchor,
  Point,
  SpriteAnchors,
  TilesetDescriptor,
} from '../tilesets/TilesetDescriptor';

// The anchors each pack's sprites carry (#97, #152), by tileset id: where on each of Civ2's units its shield goes, and
//  on each of its cities its flag and size, read from marker pixels in the player's own copy, so they come with the
//  sprites rather than with the descriptor, which only names them. Whatever loads a pack's sprites puts its anchors
//  here as well (the import stores them beside the sprites); until then a pack has none.

let anchors = new Map<string, SpriteAnchors>();

const changeHandlers = new Set<() => void>();

/** Calls `handler` whenever a pack's anchors are set, so anything drawn with the ones before can be drawn again. */
export const onSpriteAnchorsChanged = (handler: () => void): void => {
  changeHandlers.add(handler);
};

/** Keeps `spriteAnchors` as the anchors of the pack whose id is `tilesetId`, in place of any it had. */
export const setSpriteAnchors = (
  tilesetId: string,
  spriteAnchors: SpriteAnchors
): void => {
  anchors.set(tilesetId, spriteAnchors);
  changeHandlers.forEach((handler) => handler());
};

/** Forgets every pack's anchors. */
export const clearSpriteAnchors = (): void => {
  anchors = new Map();
  changeHandlers.forEach((handler) => handler());
};

/** The anchors `tileset`'s sprites carry, by sprite and anchor name: none until its sprites' anchors are set. */
export const spriteAnchors = (tileset: TilesetDescriptor): SpriteAnchors =>
  anchors.get(tileset.id) ?? {};

/**
 * Where `anchor` is on `tileset`'s sprite `sprite`, in native px from its top-left corner: the point itself, or the
 * sprite's anchor of that name. `null` when the sprite has no anchor of that name, so that what goes there is left out
 * rather than drawn somewhere it isn't.
 */
export const resolveAnchor = (
  tileset: TilesetDescriptor,
  sprite: string,
  anchor: Anchor
): Point | null =>
  typeof anchor === 'string'
    ? spriteAnchors(tileset)[sprite]?.[anchor] ?? null
    : anchor;

export default spriteAnchors;
