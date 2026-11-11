import i18next, { t } from 'i18next';
import { BuildItem, CityBuild, Entity } from '@civ-clone/ui-protocol/types';
import type { QueueEdit } from '@civ-clone/ui-protocol/cityBuild';
import { BuildHold } from '../../lib/cityTurns';
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

/**
 * What a held build waits for, in words (#959): "Waiting until the city is size 2" while it is paid for and waiting,
 *  "Will wait until the city is size 2" before. Worded from the ids of the rules holding it, the first with a sentence
 *  of its own (`City.Build.Held.waiting-for.<id>`, its id with `:` and `/` as `.`), or the plain "Waiting" / "Will
 *  wait when finished" for a rule with none, or no id. Never worked out from the city: the page knows no rules.
 */
export const heldText = ({ now, held }: BuildHold): string => {
  const state = now ? 'waiting' : 'will-wait';

  return t(
    [
      ...held
        .filter((id): id is string => id !== null)
        .map(
          (id) => `City.Build.Held.${state}-for.${id.replace(/[:/]/g, '.')}`
        ),
      `City.Build.Held.${state}`,
    ],
    { interpolation: { escapeValue: false } }
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
