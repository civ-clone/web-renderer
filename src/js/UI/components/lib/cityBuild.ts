import { t } from 'i18next';
import { BuildItem, CityBuild, Entity } from '../../types';
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
