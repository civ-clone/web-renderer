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

/**
 * Whether a notice that a paid-for build is waiting (#970) is still true of `cities`, as the engine last sent them: its
 *  city's build is the same item, paid for and held (`buildHold`). Once it isn't (completed, cancelled, changed, or its
 *  shields lost), the notice is withdrawn rather than left saying so. Any other notice, or one whose city isn't among
 *  `cities` to say, stands.
 */
export const heldNoticeStands = (
  notification: {
    key: string;
    data?: { city?: { id?: string }; item?: { _?: string } };
  },
  cities: City[]
): boolean => {
  if (!notification.key.startsWith('City.building-held.')) {
    return true;
  }

  const city = cities.find(({ id }) => id === notification.data?.city?.id);

  return (
    city === undefined ||
    (buildHold(city.build)?.now === true &&
      city.build.building?.item?._ === notification.data?.item?._)
  );
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
