import { Entity, EntityInstance } from '../types';

type ClassNameStatus = {
  [key: string]: boolean;
};

/**
 * Ensures the `__` property contains at least one of the passed in  `classNames`.
 */
export const instanceOf = (
  object: Entity | EntityInstance,
  ...classNames: string[]
) =>
  object.__.some((entityClassName: string) =>
    classNames.includes(entityClassName)
  );

/**
 * Ensures the `__` property contains each of the passed in `classNames`.
 */
export const instanceOfAll = (
  object: Entity | EntityInstance,
  ...classNames: string[]
) =>
  Object.values(
    object.__.reduce(
      (classNameStatus: ClassNameStatus, className) => {
        if (Object.prototype.hasOwnProperty.call(classNameStatus, className)) {
          classNameStatus[className] = true;
        }

        return classNameStatus;
      },
      classNames.reduce((classNameStatus: ClassNameStatus, className) => {
        classNameStatus[className] = false;

        return classNameStatus;
      }, {})
    )
  ).every((value) => value);

export default instanceOf;
