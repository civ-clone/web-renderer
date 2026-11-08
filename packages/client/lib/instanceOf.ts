import { Entity, EntityInstance } from '../types';

/**
 * Ensures the `__` property contains at least one of the passed in  `classNames`.
 */
export const instanceOf = (
  object: Entity | EntityInstance | null,
  ...classNames: string[]
): boolean =>
  object?.__.some((entityClassName: string) =>
    classNames.includes(entityClassName)
  ) ?? false;

export default instanceOf;
