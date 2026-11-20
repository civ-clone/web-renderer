// The game's own keys on the map (#1270), beside a unit's (`unitActionKeys`): what `InputController` binds, and what the
//  How to play help lists, from this one table, so the help can't show a key the game doesn't answer. A unit's orders
//  and moves are `unitActionKeys`', and a window's own keys (a city's, a list's filter) its own.

/** The key for each of the game's commands on the map, as `mappedKey` gives it. */
export const gameKeys = {
  // The leader screens (Civilization's F1 to F9) and the Civilopedia.
  cityStatus: 'F1',
  militaryReport: 'F2',
  intelligenceReport: 'F3',
  happinessReport: 'F4',
  tradeReport: 'F5',
  scienceReport: 'F6',
  wondersReport: 'F7',
  topCities: 'F8',
  civilizationScore: 'F9',
  civilopedia: '?',
  // The map.
  findCity: '/',
  centre: 'c',
  toggleUnits: 't',
  toggleYields: 'y',
  zoomIn: 'z',
  zoomOut: 'x',
  // The turn.
  wait: 'w',
  endTurn: 'Enter',
  firstAction: 'Tab',
  tradeRates: '+',
  tradeRatesDown: '-',
  saveGame: 'S',
} as const;

export type GameCommand = keyof typeof gameKeys;

/** The map's zoom (#1101), a tenth at a time: Civilization II's keys. `+` and `-` are the trade rates'. */
export const zoomKeys: { [key: string]: number } = {
  [gameKeys.zoomIn]: 1,
  [gameKeys.zoomOut]: -1,
};

/**
 * What the How to play help lists, in its order: each command it names, with the keys that do it. Commands of a map
 *  that turns (the 3D map, not offered) and the cheats aren't listed.
 */
export const helpCommands: GameCommand[][] = [
  ['endTurn'],
  ['wait'],
  ['centre'],
  ['findCity'],
  ['zoomIn', 'zoomOut'],
  ['toggleUnits'],
  ['toggleYields'],
  ['firstAction'],
  ['tradeRates', 'tradeRatesDown'],
  ['civilopedia'],
  ['cityStatus'],
  ['militaryReport'],
  ['intelligenceReport'],
  ['happinessReport'],
  ['tradeReport'],
  ['scienceReport'],
  ['wondersReport'],
  ['topCities'],
  ['civilizationScore'],
  ['saveGame'],
];

export default gameKeys;
