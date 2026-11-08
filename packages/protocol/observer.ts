// What the observer shows and is asked to show (#613, #825).

/** What the observer is asked to show (#613): some civilisations' worlds together, or the whole map. */
export type ObserverChoice =
  | { kind: 'players'; playerIds: string[] }
  | { kind: 'world' };

/** A player as the observer lists them: by id, with the civilization and leader class names for the page to name. */
export type ObservedPlayer = {
  id: string;
  civilization: string;
  leader: string | null;
};

/** What the page is told whenever the observer's view or the game's pace changes. */
export type ObserverState = {
  players: ObservedPlayer[];
  // What the page sees: some civilisations' game as they see it, or the whole map (#613).
  view: ObserverChoice;
  // Whether the turns are held between turns.
  paused: boolean;
};
