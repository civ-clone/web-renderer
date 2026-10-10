export type ChangeStatus = 'added' | 'removed' | 'updated';

export interface Release {
  version: string;
  date: string;
  localChanges: string[];
  externalChanges: {
    [key: string]: {
      status: ChangeStatus;
      log: string[];
    };
  };
}

export interface ReleaseDay extends Release {
  /** Bullets from dev-only commits (`chore:`, `test:`, `docs:`, …), shown collapsed. */
  devChanges: string[];
}

const devOnly =
  /^\s*(?:-\s*)?(?:build|chore|ci|docs|refactor|style|test)(?:\([^)]*\))?!?:\s/i;

export const isDevOnly = (change: string): boolean => devOnly.test(change);

/** The local calendar day a release falls on, as `YYYY-MM-DD`. */
export const localDay = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

/**
 * Combines `releases.json`'s one entry per commit into one entry per day, in the player's own timezone (#355). The
 *  data is untouched: this is only how the release window shows it.
 *
 * Entries come newest first and stay that way. A day takes its version and date from its newest commit, lists every
 *  bullet newest first, and sets the dev-only ones aside so they don't crowd out what a player will notice.
 */
export const byDay = (
  releases: Release[],
  dayOf: (date: Date) => string = localDay
): ReleaseDay[] => {
  // Keyed rather than by adjacency: a rebased commit can keep an older date than the one above it.
  const days = new Map<string, ReleaseDay>();

  releases.forEach((release) => {
    const day = dayOf(new Date(release.date));

    if (!days.has(day)) {
      days.set(day, {
        version: release.version,
        date: release.date,
        localChanges: [],
        devChanges: [],
        externalChanges: {},
      });
    }

    const entry = days.get(day) as ReleaseDay;

    release.localChanges.forEach((change) =>
      (isDevOnly(change) ? entry.devChanges : entry.localChanges).push(change)
    );

    Object.entries(release.externalChanges).forEach(
      ([module, { status, log }]) => {
        const existing = entry.externalChanges[module];

        if (!existing) {
          entry.externalChanges[module] = { status, log: [...(log ?? [])] };

          return;
        }

        // The newest entry's status stands, unless the package was added that day.
        if (status === 'added') {
          existing.status = 'added';
        }

        existing.log.push(...(log ?? []));
      }
    );
  });

  return Array.from(days.values());
};

export default byDay;
