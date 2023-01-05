import { Civilization } from '../../types';

export const civilizationAttribute = (
  civilization: Civilization,
  attributeName: string
) => {
  const [attribute] = civilization.attributes.filter(
    (attribute) => attribute.name === attributeName
  );

  if (!attribute) {
    return null;
  }

  return attribute.value;
};

export default civilizationAttribute;
