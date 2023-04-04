import { ObjectMap } from './lib/reconstituteData';

export type PlainObject = {
  [key: string]: any;
};

export interface Entity<Types = string> {
  _: Types;
  __: string[];
}

export interface EntityInstance<Types = string> extends Entity<Types> {
  id: string;
}

export interface City extends EntityInstance<'City'> {
  name: string;
  build: CityBuild;
  celebrateLeader: boolean;
  civilDisorder: boolean;
  growth: CityGrowth;
  improvements: EntityInstance[];
  player: Player;
  tile: PlayerTile;
  tiles: PlayerTile[];
  tilesWorked: PlayerTile[];
  units: Unit[];
  yields: Yield[];
}

export interface CityGrowth extends EntityInstance<'CityGrowth'> {
  cost: Yield;
  progress: Yield;
  size: number;
}

export interface ItemCost extends EntityInstance<'ItemCost'> {
  value: number;
}

export interface BuildItem extends EntityInstance<'BuildItem'> {
  item: Entity;
  cost: ItemCost;
}

export interface CityBuild extends EntityInstance<'CityBuild'> {
  available: BuildItem[];
  building: BuildItem | null;
  city: City;
  cost: Yield;
  progress: Yield;
  spendCost: SpendCost[];
}

export interface SpendCost extends EntityInstance<'SpendCost'> {
  resource: Entity<'Gold'>;
  value: number;
}

export interface Attribute extends EntityInstance<'Attribute'> {
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
  spaceship: Spaceship | null;
  treasuries: PlayerTreasury[];
  units: Unit[];
  world: World;
}

export interface PlayerTreasury extends EntityInstance<'Gold'> {
  value: number;
  yield: Entity;
}

export interface PlayerAction<
  Value =
    | Unit
    | PlayerResearch
    | City
    | CityBuild
    | PlayerTradeRates
    | PlayerGovernment
    | Spaceship
> extends EntityInstance {
  value: Value;
}

export type Revolution = PlayerAction<PlayerGovernment>;

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
  workedBy: City | null;
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

export interface World extends EntityInstance<'World'> {
  height: number;
  tiles: PlayerTile[];
  width: number;
}

export interface Yield<Types = 'Yield'> extends EntityInstance<Types> {
  value: number;
  values: [number, string][];
}

export interface CityImprovementContent
  extends Yield<'CityImprovementContent'> {
  cityImprovement: EntityInstance;
}

export interface CityImprovementMaintenanceGold
  extends Yield<'CityImprovementMaintenanceGold'> {
  cityImprovement: EntityInstance;
}

export interface MartialLaw extends Yield<'MartialLaw'> {
  unit: Unit;
}

export interface MilitaryUnhappiness extends Yield<'MilitaryUnhappiness'> {
  unit: Unit;
}

export interface UnitSupportFood extends Yield<'UnitSupportFood'> {
  unit: Unit;
}

export interface UnitSupportProduction extends Yield<'UnitSupportProduction'> {
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

export interface SpaceshipPart extends EntityInstance<'Part'> {
  city: City;
  yields: Yield[];
}

export interface SpaceshipLayoutSlot extends EntityInstance<'Slot'> {
  height: number;
  part: SpaceshipPart | null;
  width: number;
  x: number;
  y: number;
}

export interface SpaceshipLayout extends EntityInstance<'Layout'> {
  height: number;
  slots: SpaceshipLayoutSlot[];
  width: number;
}

export interface Spaceship extends EntityInstance<'Spaceship'> {
  activeParts: SpaceshipPart[];
  chanceOfSuccess: number;
  flightTime: number;
  inactiveParts: SpaceshipPart[];
  launched: boolean;
  layout: SpaceshipLayout;
  player: Player;
  successful: boolean;
  yields: Yield[];
}

export interface Interaction<Types = 'Interaction'>
  extends EntityInstance<Types> {
  players: Player[];
  when: number;
}

export interface Expiry extends EntityInstance<'Expiry'> {
  expired: boolean;
  expiry: number;
}

export interface Declaration<Types = 'Declaration'> extends Interaction<Types> {
  active: boolean;
  expired: boolean;
  expiry: Expiry;
}

export interface DiplomacyAction<Types = 'Action' | 'Terminate'>
  extends Interaction<Types> {
  by: Player;
  for: Player[];
  negotiation: Negotiation;
}

export interface Resolution<
  Types = 'Abstain' | 'Accept' | 'Acknowledge' | 'Decline' | 'Resolution'
> extends Interaction<Types> {
  proposal: Proposal;
}

export interface Dialogue<Types = 'Dialogue'> extends Proposal<Types> {
  key: string;
}

export interface Proposal<
  Types = 'ExchangeKnowledge' | 'Initiate' | 'OfferPeace' | 'Proposal'
> extends DiplomacyAction<Types> {
  resolution: Resolution;
  resolved: boolean;
}

export type Interactions =
  | Interaction
  | Declaration
  | DiplomacyAction
  | Resolution
  | Dialogue
  | Proposal
  | Negotiation;

export interface Negotiation extends Interaction<'Negotiation'> {
  interactions: Interactions[];
  lastInteraction: Interactions;
  terminated: boolean;
}
