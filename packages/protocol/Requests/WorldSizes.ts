import Request from '@civ-clone/core-data-client/Request';

/** A world size the rules offer a new game (#1175): its grid, its width and height on that grid, and its civilizations. */
export type WorldSizeOption = {
  key: string;
  topologyId: string;
  width: number;
  height: number;
  minPlayers: number;
  maxPlayers: number;
  players: number;
  /** Whether there's an Earth map this size. */
  earth: boolean;
};

/** What a size typed in may be, as the rules say: its grid, its bounds, each inclusive, and its civilizations. */
export type CustomWorldSizeOption = {
  topologyId: string;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  minArea: number;
  maxArea: number;
  minPlayers: number;
  maxPlayers: number;
  players: number;
};

export type WorldSizesAnswer = {
  /** In the order the rules give them, smallest first. None from rules that leave the sizes to the page (Civ1's). */
  sizes: WorldSizeOption[];
  custom: CustomWorldSizeOption | null;
};

// The world sizes the rules offer a new game (#1175), and what a size typed in may be.
export class WorldSizes extends Request<[null], WorldSizesAnswer> {
  constructor() {
    super('worldSizes', null);
  }
}

export default WorldSizes;
