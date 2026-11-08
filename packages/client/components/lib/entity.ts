import { Entity } from '../../types';
import { t } from 'i18next';

export const entityName = (
  entity: Entity | null,
  namespace?: string,
  prefix?: string,
  key: string = 'name',
  fallback: string | undefined = entity?._
): string =>
  entity
    ? t(
        (namespace ? namespace + ':' : '') +
          (prefix ? prefix + '.' : '') +
          entity._ +
          '.' +
          key,
        {
          defaultValue: fallback ?? entity._,
        }
      )
    : '';
