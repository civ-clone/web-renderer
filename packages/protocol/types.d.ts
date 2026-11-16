import { Direction, EdgeDirection, TopologyId } from './topology';
import { ObjectMap } from '@civ-clone/core-data-object/DataObject';

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

// `angry` only under rules that have angry citizens (Civ2, M2c): an unhappy citizen beyond what the city's size allows for.
export type CitizenMood = 'unhappy' | 'content' | 'happy' | 'angry';

// The happy, unhappy and angry citizens after one of the rules' stages of happiness (Civ2's: 'base', 'luxuries',
//  'buildings', 'units', 'wonders'). `unhappy` counts the angry ones too.
export interface CitizenStage {
  name: string;
  happy: number;
  unhappy: number;
  angry: number;
}

// How a city is drawn, under rules with eras (Civ2, M2c): its row of city sprites, its citizens' row, and whether it's
//  drawn a size larger (a capital, as the rules have it).
export interface CityStyle {
  era: 'ancient' | 'industrial' | 'modern';
  people: 'ancient' | 'renaissance' | 'industrial' | 'modern';
  larger: boolean;
}

export interface City extends EntityInstance<'City'> {
  name: string;
  build: CityBuild;
  celebrateLeader: boolean;
  // The working citizens' moods, from the engine's civ1-city-happiness `citizens` data, and for each Happiness or
  //  Unhappiness yield the moods once it and those before it are applied. Absent under rules that don't send it.
  citizens?: {
    moods: CitizenMood[];
    causes: { yield: Yield; moods: CitizenMood[] }[];
    // The counts after each of the rules' stages, under rules that have them (Civ2, M2c).
    stages?: CitizenStage[];
  };
  civilDisorder: boolean;
  // Whether the engine has declared the city in civil disorder (#193), as the
  // map shows it. `civilDisorder` is whether it would riot as things stand.
  civilDisorderDeclared: boolean;
  growth: CityGrowth;
  improvements: CityImprovement[];
  originalPlayer: Player;
  player: Player;
  // How much the city pollutes, from the engine's civ1-city-improvement `pollution` data: never below 0, and above 0 only
  //  when the city risks polluting the land around it (#402). Absent under rules that don't send it.
  pollution?: number;
  specialists: Specialist[];
  // The kinds of specialist the city may have now, by type name, under rules that limit them (Civ2, M2c).
  specialistsAvailable?: string[];
  // What each square in the city's radius yields this city, under rules where that differs from the square's own
  //  yields (Civ2's Harbour, Supermarket, celebration, M2c). Read through `squareYields` (`ui-client/lib/yieldMap`).
  squareYields?: {
    x: number;
    y: number;
    yields: { _: string; value: number }[];
  }[];
  // How it's drawn, under rules with eras (Civ2, M2c), a rival's city's too.
  style?: CityStyle;
  tile: PlayerTile;
  tiles: PlayerTile[];
  tilesWorked: PlayerTile[];
  // Only for your own cities (#57).
  tradeRoutes?: { civilization: string; name: string; trade: number }[];
  units: Unit[];
  yields: Yield[];
}

export type Specialist = EntityInstance<
  'Entertainer' | 'TaxCollector' | 'Scientist'
>;

export interface CityGrowth extends EntityInstance<'CityGrowth'> {
  cost: Yield;
  // What the city needs before it can grow past `size`, from the ruleset (#781): `needs` is an improvement's type name.
  limit?: { size: number; needs: string } | null;
  progress: Yield;
  size: number;
}

export interface ItemCost extends EntityInstance<'ItemCost'> {
  value: number;
}

export interface BuildItem extends EntityInstance<'BuildItem'> {
  item: Entity;
  cost: ItemCost;
  // Only in a city's build list (`CityBuildAvailable`): the item's section (#432) and a unit's numbers (#381).
  group?: 'unit' | 'improvement' | 'spaceship' | 'wonder' | null;
  stats?: {
    attack: number;
    defence: number;
    movement: number;
    visibility: number;
  } | null;
  // Only in a city's build list (`CityBuildAvailable`): the ids of the rules that would hold the city's build of the
  //  item (#970), for the city as it is now, `null` for a rule without one, as a build's `held` is for the item being
  //  built. Empty when nothing would. Read through `offeredHold` (`ui-client/lib/cityTurns`).
  held?: (string | null)[];
  // Only in a city's build list, under rules that take part of the progress on a change of item (Civ2, M2c): the
  //  progress the build would have after changing to this item now.
  progressAfterChange?: number;
  // Only in a city's build list, for an item that never completes but turns the city's shields into gold
  //  (Capitalization, Civ2, M2c): the gold it would make each turn.
  goldPerTurn?: number;
}

export interface CityBuild extends EntityInstance<'CityBuild'> {
  // Whether the city chooses its improvements itself (#194).
  auto: boolean;
  building: BuildItem | null;
  city: City;
  // Why it's building nothing (#716): it finished `item`, stopped building it, or can no longer build it, or the city is
  //  new or has changed hands. `null` while it builds something, or when it isn't known, as in an older save.
  cleared: {
    reason:
      | 'cancelled'
      | 'captured'
      | 'completed'
      | 'created'
      | 'unavailable'
      | string;
    item: Entity | null;
  } | null;
  cost: Yield;
  // The ids of the rules holding the item being built (#959), from the moment it's chosen, `null` for a rule without
  //  one: with something still to pay (`remaining > 0`) it will wait once paid for, and with nothing left it is waiting
  //  now. Empty while nothing holds it or nothing is being built. Missing from an engine before core-city-build 0.1.21.
  //  The page reads the state from this and `remaining` alone, through `buildHold` (`ui-client/lib/cityTurns`).
  held?: (string | null)[];
  // The gold a city building Capitalization makes each turn (Civ2, M2c), `null` for any other build. Under rules without
  //  it, never sent.
  goldPerTurn?: number | null;
  // What the city chooses from on Auto, under rules with a choice (Civ2: 'any', 'units' or 'improvements', M2c), `null`
  //  while it isn't on Auto. Never sent under rules without one.
  autoMode?: string | null;
  progress: Yield;
  // The cost less the progress: at or below 0 once the item is paid for.
  remaining?: number;
  // What it builds after its current item, in order, priced for the city now (#774), and what the last move to the next
  //  of them dropped as it could no longer be built. Missing from an engine without the queue.
  queue?: BuildItem[];
  // The ids of the rules that would hold each queued item (#970), by its place in `queue`, for the city as it is now:
  //  by the time it is reached the city may have grown or shrunk, so it says what holds it as things stand. Sent by
  //  the worker (`AdditionalData/queueHeld`), and missing from an older worker. Read through `queuedHold`.
  queueHeld?: (string | null)[][];
  queueDropped?: Entity[];
  spendCost: SpendCost[];
}

export interface SpendCost extends EntityInstance<'SpendCost'> {
  resource: Yield;
  value: number;
}

export interface Attribute extends EntityInstance<'Attribute'> {
  name: string;
  value: any;
}

export interface Civilization extends EntityInstance {
  attributes: Attribute[];
  leader: Leader;
  // What the leader is called under their government, as a translation key, under rules with titles (Civ2's, M2d).
  leaderTitle?: string | null;
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
  // Turns until the new government can be chosen, or `null` with no revolution under way.
  anarchyTurns: number | null;
  available: Entity[];
  current: EntityInstance;
}

export interface PlayerResearch extends EntityInstance {
  available: Entity[];
  complete: EntityInstance[];
  cost: Yield;
  // Keyed on advance name, only while choosing what to research next.
  costs: { [advance: string]: number };
  progress: Yield;
  researching: Entity | null;
  // Why it's researching nothing (#726): the player discovered `advance`, or acquired it some other way. `null` while
  //  researching something, or when it isn't known, as in a new game or an older save.
  cleared?: {
    reason: 'acquired' | 'completed' | string;
    advance: Entity;
  } | null;
}

export interface PlayerTradeRates extends EntityInstance {
  all: Yield[];
  // The most each rate may be set to, as a whole percentage by the rate's name, under rules with a maximum (Civ2's,
  //  M2d). A rate not listed has none.
  maxRates?: { [rate: string]: number };
  // Where a rate is worth less than it's set to, as a whole percentage by the rate's name: Civ2's Fundamentalism takes
  //  no more than half the trade for research, whatever the research rate.
  limitedRates?: { [rate: string]: number };
}

export interface Unit extends EntityInstance {
  // Only for the unit the UI has asked about, usually the active one (#323): read them through `lib/unitActions`.
  actions?: UnitAction[];
  actionsForNeighbours?: {
    [key: string]: UnitAction[];
  };
  // The distant squares each of the unit's long-range orders reaches (Paradrop, Airlift), by the action's name. Only for
  //  the unit the UI has asked about, as `actions` are, and only from rules that have such orders.
  actionTargets?: {
    [action: string]: Tile[];
  } | null;
  active: boolean;
  attack: Yield;
  busy: Entity | null;
  city: City | null;
  defence: Yield;
  // What the unit's defence is multiplied by where it stands, and by what: its terrain, then City Walls or being
  //  fortified (#743). `null` when nothing is.
  defenceBonus?: {
    multiplier: number;
    sources: { name: string; multiplier: number }[];
  } | null;
  // An aircraft's fuel (Civ2): its range in turns away from a refuelling point, and the turns of it left, this one
  //  included. Not sent by rules without fuel, `null` for a unit that needs none.
  fuel?: { range: number; turnsLeft: number } | null;
  // The damage a unit deals each round of a battle it wins (Civ2). Not sent by rules without it.
  firepower?: number | null;
  // The hit points a unit has left and its most (Civ2): a unit hurt in battle keeps its damage until it heals. Not
  //  sent by rules without them.
  hitPoints?: { current: number; max: number } | null;
  improvements: EntityInstance[];
  // Why the engine won't let this unit join the city it stands in (#279).
  joinCityRefusal?: { reason: string; [detail: string]: unknown } | null;
  movement: Yield;
  moves: Yield;
  player: Player;
  // The route orders (`RoadTo`, `RailroadTo`) the engine would give this unit for a distant square (#195).
  routeOrders?: string[];
  status: EntityInstance;
  tile: Tile;
  visibility: Yield;
  yields: Yield[];
}

export interface UnitAction<Types = string> extends EntityInstance<Types> {
  from: Tile;
  // The terrain the action leaves behind, for those that change it (#348).
  result?: string | null;
  // What a Pillage can take from its square, by type name, when the rules let the player choose (Civ2).
  targets?: string[];
  // Which of its `targets` the player chose, set by the page as the action is sent (M2b).
  choice?: string;
  to: Tile;
}

export interface SneakAttack
  extends UnitAction<
    'SneakAttack' | 'SneakCaptureCity' | 'SneakNuclearAttack'
  > {
  enemy: Player;
}

export interface Terrain extends EntityInstance {
  features: EntityInstance[];
  // What the terrain does for a unit on it (#748): a defender's multiplier, and the cost to move onto it without a road,
  //  a ship's on water (`null` for a terrain the rules don't cost). Not on an unseen square's.
  defence?: number;
  movementCost?: number | null;
}

export interface Coordinate {
  x: number;
  y: number;
}

export interface Tile extends EntityInstance, Coordinate {
  // Only on the city map's copies of a city's squares (M2c): their `yields` are already the city's figures, and their x
  //  and y are the small map's, not the world's.
  squareYieldsApplied?: boolean;
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

// The world's topology says which directions there are (#88).
export type AdjacentNeighbour = EdgeDirection;
export type NeighbourDirection = Direction;

export interface World extends EntityInstance<'World'> {
  height: number;
  tiles: PlayerTile[];
  // Which grid the world is on (#89). A save made before the grid was recorded does not say: it is square.
  topologyId?: TopologyId;
  width: number;
}

export interface Yield<Types = string> extends EntityInstance<Types> {
  value: number;
  values: [number, string][];
}

export interface CityImprovement extends EntityInstance {
  // What it sells for, from core-treasury's `Sell` rules: empty when it can't be sold now (#31).
  saleValue?: SpendCost[];
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

// The level the game is played at (#173): the level's class, by name.
export interface GameDifficulty extends EntityInstance<'GameDifficulty'> {
  difficulty: Entity;
}

export interface GameData extends EntityInstance {
  // Null in a game a host started without choosing a level.
  difficulty: GameDifficulty | null;
  player: Player;
  turn: Yield;
  year: Yield;
}

export interface Notification {
  message: string;
}

type DataPatchType = 'add' | 'update';

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
  // Who answered, and to whom: a resolution is an action of its own.
  by?: Player;
  for?: Player[];
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
