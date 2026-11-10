import { t } from 'i18next';

// Anything the engine names by its class, `_`: a unit, an advance, a civilization.
type Named = { _: string };

export const entityName = (
  entity: Named | null,
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
