import i18next, { t } from 'i18next';
import {
  BuildItem,
  City,
  CityBuild,
  Entity,
} from '@civ-clone/ui-protocol/types';
import type { QueueEdit } from '@civ-clone/ui-protocol/cityBuild';
import { BuildHold, buildHold } from '../../lib/cityTurns';
import Transport from '../../Transport';

export const getLabelForBuildable = (buildable: BuildItem | null): string =>
  buildable?.item
    ? getLabelForBuildableEntity(buildable.item)
    : t('City.Build.nothing');

export const getLabelForBuildableEntity = (buildable: Entity): string =>
  t(
    [
      `city:Improvement.${buildable._}.name`,
      `spaceship:${buildable._}.name`,
      `unit:${buildable._}.name`,
      `wonder:${buildable._}.name`,
    ],
    {
      defaultValue: buildable._,
    }
  );

// A held build's sentence (#959): the first of the rules holding it with one of its own (`City.Build.Held.<kind>.<id>`,
//  its id with `:` and `/` as `.`, in the rule's package's translations), or the plain one (`City.Build.Held.<kind>`)
//  for a rule with none, or no id. Never worked out from the city: the page knows no rules.
const heldSentence = (
  kind: string,
  held: (string | null)[],
  options: object = {}
): string =>
  t(
    [
      ...held
        .filter((id): id is string => id !== null)
        .map((id) => `City.Build.Held.${kind}.${id.replace(/[:/]/g, '.')}`),
      `City.Build.Held.${kind}`,
    ],
    { ...options, interpolation: { escapeValue: false } }
  );

/**
 * What holds a build back, in words (#959): "Waiting until the city is size 2" once it is paid for, and "Can’t be
 *  completed until the city is size 2" before, which is true whether or not it ever comes to wait: the page doesn't
 *  foresee the city's growth. "Waiting" / "Can’t be completed yet" for a rule without a sentence of its own.
 */
export const heldText = ({ now, held }: BuildHold): string =>
  heldSentence(now ? 'waiting' : 'cannot-complete', held);

/** The same, as a sentence about `item`, for the Buy confirmation: "Settlers can’t be completed until the city is size 2." */
export const heldPurchaseText = ({ held }: BuildHold, item: string): string =>
  heldSentence('purchase', held, { item });

/**
 * What a notice that a paid-for build is waiting (#970, `City.building-held.*`) is worded with besides what it was
 *  sent: `reason`, from the ids of the rules holding it, in the words the city screen has for a build waiting now
 *  ("Waiting until the city is size 2"). Nothing for any other notice. Every place that words a notice adds it.
 */
export const heldNoticeData = (notification: {
  key: string;
  data?: { held?: unknown };
}): { reason?: string } =>
  notification.key.startsWith('City.building-held.') &&
  Array.isArray(notification.data?.held)
    ? {
        reason: heldText({
          now: true,
          held: notification.data!.held as (string | null)[],
        }),
      }
    : {};

/** What `judgeHeldNotice` makes of a notice: whether it stands, and whether its city has been among the view's own. */
export type HeldNoticeJudgement = { stands: boolean; citySeen: boolean };

/**
 * Whether a notice that a paid-for build is waiting (#970) is still true, judged on the page's data: `cities`, the
 *  view's own as the engine last sent them, for `turn`. Any other notice stands, untouched.
 *
 * Only data for the notice's own turn (`data.turn`, sent with it) or later can say the wait is over: a watcher's notices
 *  arrive before the data of the turn they tell of, and the turn before's still has the build being paid for.
 *
 * In such data the notice stands while its city's build is the same item, paid for and held (`buildHold`), and is
 *  withdrawn once it isn't (completed, cancelled, changed, or its shields lost), rather than left saying so. It is
 *  withdrawn too once its city, having been among the view's own (`citySeen`, kept by the caller), no longer is:
 *  captured, destroyed or given away. A city the page never has in full, a watched civilisation's other than the one
 *  the data is shaped as, can't be judged at all, so its notice stands, and goes with the turn as any notice does.
 */
export const judgeHeldNotice = (
  notification: {
    key: string;
    data?: { city?: { id?: string }; item?: { _?: string }; turn?: number };
  },
  cities: City[],
  turn: number | undefined,
  citySeen: boolean
): HeldNoticeJudgement => {
  if (!notification.key.startsWith('City.building-held.')) {
    return { stands: true, citySeen };
  }

  const city = cities.find(({ id }) => id === notification.data?.city?.id),
    seen = citySeen || city !== undefined,
    noticeTurn = notification.data?.turn;

  // Data from before the notice's turn says nothing of its wait.
  if (
    typeof noticeTurn === 'number' &&
    typeof turn === 'number' &&
    turn < noticeTurn
  ) {
    return { stands: true, citySeen: seen };
  }

  if (city === undefined) {
    return { stands: !seen, citySeen: seen };
  }

  return {
    stands:
      buildHold(city.build)?.now === true &&
      city.build.building?.item?._ === notification.data?.item?._,
    citySeen: seen,
  };
};

// Why a city building nothing is asked what to build (#716), or `null` when it is building something, the reason isn't
//  known (an older save), or it's one with no words here.
export const getClearedLabel = (cityBuild: CityBuild): string | null => {
  const { building, cleared } = cityBuild;

  if (building !== null || !cleared) {
    return null;
  }

  const key = `City.Build.cleared.${cleared.reason}`;

  if (!i18next.exists(key)) {
    return null;
  }

  return t(key, {
    item: cleared.item
      ? getLabelForBuildableEntity(cleared.item)
      : t('City.Build.nothing'),
  });
};

// The label for the button that puts a city on Auto, or takes it off (#194).
export const getAutoLabel = (cityBuild: CityBuild): string =>
  t(cityBuild.auto ? 'City.Build.auto-stop' : 'City.Build.auto');

// Puts a city on Auto, where it chooses its own improvements, or takes it off and leaves its build as it is (#194). It
//  answers the city's `CityBuild` action while it builds nothing, and its `ChangeProduction` action otherwise.
export const toggleAuto = (cityBuild: CityBuild, transport: Transport): void =>
  transport.send('action', {
    name: cityBuild.building === null ? 'CityBuild' : 'ChangeProduction',
    id: cityBuild.id,
    auto: !cityBuild.auto,
  });

/**
 * Edits what a city builds after its current item (#774): adds `chosen` (or starts it, if the city builds nothing),
 *  removes or moves the item at `index` (with the queue as the player saw it, `queued`, so a second click sent before
 *  the first's update changes nothing), or clears them all. It answers the city's `CityBuild` action while it builds
 *  nothing, and its `ChangeProduction` action otherwise, as `toggleAuto` does.
 */
export const editQueue = (
  cityBuild: CityBuild,
  transport: Transport,
  queue: QueueEdit
): void =>
  transport.send('action', {
    name: cityBuild.building === null ? 'CityBuild' : 'ChangeProduction',
    id: cityBuild.id,
    queue,
  });
