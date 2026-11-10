// The tileset's sprite for each group of yields.
const icons = {
  Food: 'city/food',
  Production: 'city/production',
  Trade: 'city/trade',
  Gold: 'city/gold',
  Luxuries: 'city/luxury',
  Pollution: 'city/pollution',
  Research: 'city/bulb',
  Unhappiness: 'city/sad',
};

// Named here (`groupIcons.Gold`), or looked up by a yield's name from the engine, which may have none.
export const groupIcons: typeof icons & { [group: string]: string } = icons;
