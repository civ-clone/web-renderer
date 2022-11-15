export const knownGroups: { [key: string]: string } = {
  Food: 'Food',
  UnitSupportFood: 'Food',
  PopulationSupportFood: 'Food',
  Production: 'Production',
  UnitSupportProduction: 'Production',
  Trade: 'Trade',
  Corruption: 'Trade',
  Happiness: 'Happiness',
  LuxuryHappiness: 'Happiness',
  Unhappiness: 'Unhappiness',
  MartialLawContent: 'Unhappiness',
  MilitaryUnhappiness: 'Unhappiness',
  PopulationUnhappiness: 'Unhappiness',
  CityImprovementContent: 'Unhappiness',
  Research: 'Research',
  Luxuries: 'Luxuries',
  Gold: 'Gold',
  CityImprovementMaintenanceGold: 'Gold',
};

export const knownGroupLookup = Object.entries(knownGroups).reduce(
  (object, [yieldName, group]) => {
    if (!Object.prototype.hasOwnProperty.call(object, group)) {
      object[group] = [];
    }

    object[group].push(yieldName);

    return object;
  },
  {} as { [key: string]: string[] }
);

export const knownIcons: { [key: string]: string } = {
  Food: 'city/food.png',
  Production: 'city/production.png',
  Trade: 'city/trade.png',
  Gold: 'city/gold.png',
  Luxuries: 'city/luxury.png',
  Pollution: 'city/pollution.png',
  Research: 'city/bulb.png',
  Unhappiness: 'city/sad.png',
};
