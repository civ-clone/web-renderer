import { ObjectMap } from './lib/reconstituteData';

export interface ITransport {
  receive(channel: string, handler: (...args: any[]) => void): void;
  receive(channel: 'gameData', handler: (data: ObjectMap) => void): void;
  receive(channel: 'notification', handler: (data: string) => void): void;
  receive(
    channel: 'gameNotification',
    handler: (data: Notification) => void
  ): void;
  receiveOnce(channel: string, handler: (...args: any[]) => void): void;
  receiveOnce(channel: 'gameData', handler: (data: ObjectMap) => void): void;
  receiveOnce(channel: 'notification', handler: (data: string) => void): void;
  receiveOnce(
    channel: 'gameNotification',
    handler: (data: Notification) => void
  ): void;
  send(channel: string, payload?: any): void;
}

export type PlainObject = {
  [key: string]: any;
};

export interface Entity {
  _: string;
}

export interface EntityInstance extends Entity {
  id: string;
}

export interface City extends EntityInstance {
  name: string;
  build: CityBuild;
  growth: CityGrowth;
  improvements: EntityInstance[];
  player: Player;
  tile: PlayerTile;
  tiles: PlayerTile[];
  tilesWorked: PlayerTile[];
  units: Unit[];
  yields: Yield[];
}

export interface CityGrowth extends EntityInstance {
  cost: Yield;
  progress: Yield;
  size: number;
}

export interface ItemCost extends EntityInstance {
  value: number;
}

export interface BuildItem extends EntityInstance {
  item: Entity;
  cost: ItemCost;
}

export interface CityBuild extends EntityInstance {
  available: BuildItem[];
  building: BuildItem | null;
  city: City;
  cost: Yield;
  progress: Yield;
}

export interface Attribute extends EntityInstance {
  name: string;
  value: any;
}

export interface Civilization extends EntityInstance {
  attributes: Attribute[];
  leader: Leader;
}

export interface Leader extends EntityInstance {
  name: string;
}

export interface Player extends EntityInstance {
  actions: PlayerAction[];
  civilization: Civilization;
  cities: City[];
  government: PlayerGovernment;
  mandatoryActions: PlayerAction[];
  research: PlayerResearch;
  treasury: Yield;
  units: Unit[];
  world: World;
}

export interface PlayerAction extends EntityInstance {
  value:
    | Unit
    | PlayerResearch
    | CityBuild
    | PlayerTradeRates
    | PlayerGovernment;
}

export interface PlayerGovernment extends EntityInstance {
  available: Entity[];
  current: EntityInstance;
}

export interface PlayerResearch extends EntityInstance {
  available: Entity[];
  complete: EntityInstance[];
  cost: Yield;
  progress: Yield;
  researching: Entity | null;
}

export interface PlayerTradeRates extends EntityInstance {
  all: Yield[];
}

export interface Unit extends EntityInstance {
  actions: UnitAction[];
  actionsForNeighbours: {
    [key: string]: UnitAction[];
  };
  active: boolean;
  attack: Yield;
  busy: Entity | null;
  city: City | null;
  defence: Yield;
  improvements: EntityInstance[];
  movement: Yield;
  moves: Yield;
  player: Player;
  status: EntityInstance;
  tile: Tile;
  visibility: Yield;
  yields: Yield[];
}

export interface UnitAction extends EntityInstance {
  from: Tile;
  to: Tile;
}

export interface Terrain extends EntityInstance {
  features: EntityInstance[];
}

export interface Coordinate {
  x: number;
  y: number;
}

export interface Tile extends EntityInstance, Coordinate {
  city: City | null;
  goodyHut: EntityInstance | null;
  improvements: EntityInstance[];
  isCoast: boolean;
  isLand: boolean;
  isWater: boolean;
  terrain: Terrain;
  units: Unit[];
  yields: Yield[];
}

export interface PlayerTile extends Tile {
  city: City | null;
  goodyHut: EntityInstance | null;
  improvements: EntityInstance[];
  isCoast: boolean;
  isLand: boolean;
  isWater: boolean;
  terrain: Terrain;
  tile: Tile;
  units: Unit[];
  yields: Yield[];
}

export type AdjacentNeighbour = 'n' | 'e' | 's' | 'w';
export type NeighbourDirection = AdjacentNeighbour | 'ne' | 'se' | 'sw' | 'nw';

export interface World extends EntityInstance {
  height: number;
  tiles: PlayerTile[];
  width: number;
}

export interface Yield extends EntityInstance {
  value: number;
  values: [number, string][];
}

export interface CityImprovementMaintenanceGold extends Yield {
  _: 'CityImprovementMaintenanceGold';
  cityImprovement: EntityInstance;
}

export interface MartialLawContent extends Yield {
  _: 'MartialLawContent';
  unit: Unit;
}

export interface MilitaryUnhappiness extends Yield {
  _: 'MilitaryUnhappiness';
  unit: Unit;
}

export interface UnitSupportFood extends Yield {
  _: 'UnitSupportFood';
  unit: Unit;
}

export interface UnitSupportProduction extends Yield {
  _: 'UnitSupportProduction';
  unit: Unit;
}

export interface GameData extends EntityInstance {
  player: Player;
  turn: Yield;
  year: Yield;
}

export interface Notification {
  message: string;
}

type DataPatchType = 'add' | 'remove' | 'update';

type DataPatchContents = {
  type: DataPatchType;
  index?: string | null;
  value?: ObjectMap | PlainObject;
};

export type DataPatch = {
  [id: string]: DataPatchContents;
};
