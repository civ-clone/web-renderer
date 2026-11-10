/** The choice that leaves a civilization or leader to be asked for, or drawn, when the world is built. */
export const RANDOM = 'random';

export type SeatKind = 'human' | 'computer';

/**
 * A seat in a game being set up (#604): who plays it, and what was chosen for it before the game starts. The
 * `seats` option is a list of these, in player order.
 */
export type Seat = {
  kind: SeatKind;
  // A civilization's class name, or `random` (the default).
  civilization?: string;
  // One of that civilization's leaders, by class name, or `random` (the default).
  leader?: string;
  // A computer seat's AI client, by class name, from the AI client registry; the host's default when left out.
  ai?: string;
  // A human seat's name, for the hand-over and notifications once there can be several (#161).
  name?: string;
};

const KINDS: SeatKind[] = ['human', 'computer'];

export const isSeat = (value: unknown): value is Seat =>
  typeof value === 'object' &&
  value !== null &&
  KINDS.includes((value as Seat).kind) &&
  ['civilization', 'leader', 'ai', 'name'].every(
    (key: string): boolean =>
      (value as Record<string, unknown>)[key] === undefined ||
      typeof (value as Record<string, unknown>)[key] === 'string'
  );

/**
 * The seats a game starts with: the `seats` option as given, or, without one, the `players` count as one human seat
 * followed by computer seats, which is how every game was set up before #604. A game can have no human seat.
 */
export const seatsFromOptions = (seats: unknown, players: unknown): Seat[] => {
  if (seats !== undefined && seats !== null) {
    if (!Array.isArray(seats) || seats.length === 0 || !seats.every(isSeat)) {
      throw new TypeError(
        "The 'seats' option must be a list of at least one { kind: 'human' | 'computer', … }."
      );
    }

    return seats;
  }

  const count = parseInt(String(players), 10);

  if (!(count > 0)) {
    throw new TypeError(
      `The 'players' option must be a positive number, not '${players}'.`
    );
  }

  return new Array(count).fill(0).map(
    (value: 0, index: number): Seat => ({
      kind: index === 0 ? 'human' : 'computer',
    })
  );
};
