// Units arriving on the 3D map or leaving it with no move (docs/3d-renderer.md §6.4, §8.2): built, bought, disbanded,
//  lost, or going out of sight or coming into it. Each fades in or out over half a second. Pure, and by the clock, as
//  walks and battles are: the view says what's fading, and asks how solid each is at the time it draws.

/** How long a unit takes to fade in or out, in ms. */
export const FADE = 500;

/** A fade under way: in, from nothing to solid, or out, from solid to nothing. */
export type Fade = {
  id: string;
  kind: 'in' | 'out';
  start: number;
  duration: number;
};

/** How solid a fade is at `now`, from 0 to 1. */
export const fadeAt = (
  { kind, start, duration }: Fade,
  now: number
): number => {
  const through =
    duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - start) / duration));

  return kind === 'in' ? through : 1 - through;
};

export class Fades {
  #fades = new Map<string, Fade>();
  #made = 0;

  /** How many fades are under way. */
  size(): number {
    return this.#fades.size;
  }

  /** A unit fading `kind` from `now`, over `duration`: its fade's id. */
  add(kind: Fade['kind'], now: number, duration: number = FADE): string {
    const id = `fade-${++this.#made}`;

    this.#fades.set(id, { id, kind, start: now, duration });

    return id;
  }

  /** The fades under way at `now`, with how solid each is, and those over since, taken off. */
  at(now: number): {
    going: { id: string; kind: Fade['kind']; opacity: number }[];
    ended: string[];
  } {
    const going: { id: string; kind: Fade['kind']; opacity: number }[] = [],
      ended: string[] = [];

    this.#fades.forEach((fade, id) => {
      if (now >= fade.start + fade.duration) {
        ended.push(id);
        this.#fades.delete(id);

        return;
      }

      going.push({ id, kind: fade.kind, opacity: fadeAt(fade, now) });
    });

    return { going, ended };
  }

  /** The fade `id` over now, if it's under way. */
  end(id: string): void {
    this.#fades.delete(id);
  }

  /** Every fade over now: their ids. */
  endAll(): string[] {
    const ended = [...this.#fades.keys()];

    this.#fades.clear();

    return ended;
  }
}

export default Fades;
