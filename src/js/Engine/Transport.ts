import { Request, RequestArgs, RequestReturn } from './Request';
import { CheatPlayersResult } from './Requests/CheatPlayers';
import { CivilizationOption } from './Requests/Civilizations';
import { ObserverState } from './Observer';
import { ObserverChoice } from './ObserverViews';
import { DifficultyOption } from './Requests/Difficulties';
import { IntelligenceRow } from './lib/intelligence';
import { RequirementData } from './lib/requirements';
import { CivilopediaEntry, UnavailableBuildItem } from './lib/civilopedia';
import { CivilizationScore } from './lib/civilizationScore';
import { GameOverDetails } from './lib/gameOver';
import { TopCitiesRow } from './lib/topCities';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import { DataPatch } from './DataQueue';
import Notification from './Notification';
import { ObjectMap } from '../UI/lib/reconstituteData';

// Which request a message asks or answers (#470): the page's `request` gives each one its own, and the worker's reply,
//  or its `requestFailed`, carries it back, so a reply is matched to its request and not only to its channel.
export type RequestId = number;

export type TransportMessage<
  Channel extends keyof TransportDataMap = keyof TransportDataMap
> = {
  channel: Channel;
  data: TransportReceiveArgs<TransportDataMap[Channel]>;
  // Only on a request and its reply.
  id?: RequestId;
};

export type TransportData<Send = any, Receive = any> = {
  send: Send;
  receive: Receive;
};

export type TransportSendArgs<Data extends TransportData> =
  Data extends TransportData<infer Send> ? Send : never;

export type TransportReceiveArgs<Data extends TransportData> =
  Data extends TransportData<any, infer Receive> ? Receive : never;

// What came with a message besides its data: the payload as it arrived, before `WorkerTransport` rebuilt it, and the
//  request the message asks or answers, when it is one.
export type TransportMeta = {
  rawData?: ObjectMap;
  id?: RequestId;
};

export type TransportReceiveHandler<Data extends TransportData> = (
  data: TransportReceiveArgs<Data>,
  meta?: TransportMeta
) => void;

export type TransportDisposer = () => void;

// A request the worker could not answer, on the channel it was asked on (#470), and which one it was.
export type TransportFailure = {
  channel: string;
  message: string;
  id: RequestId;
};

// Something went wrong in the worker (#470). `notAnswering` is the page's own: the worker has said nothing for a while
//  when a request is waiting on it, and the page says so in its own words, as `message` names no more than a channel.
export type TransportWorkerError = {
  message: string;
  notAnswering?: boolean;
};

// A `notification` the page translates (#588): the key, in the default namespace, and what its text reads. The others
//  on that channel are text as it is shown.
export type TransportTranslatedNotice = {
  key: string;
  data: { [key: string]: unknown };
};

// An action the worker has handled, as the UI sent it: enough to tell which one it was (#326).
export type TransportHandledAction = {
  name: string;
  id?: string;
  unitAction?: string;
  target?: string;
};

type TransportPlayerAction = {
  [Name in keyof TransportPlayerActionMap]: {
    name: Name;
  } & TransportPlayerActionMap[Name];
}[keyof TransportPlayerActionMap];

type TransportCheatData = {
  [Name in keyof CheatDataMap]: {
    name: Name;
    value: CheatDataMap[Name];
  };
}[keyof CheatDataMap];

declare global {
  interface TransportDataMap {
    [key: string]: TransportData;
    action: TransportData<never, TransportPlayerAction>;
    // An action has been handled and the patch with its result has gone, so the UI can settle a move it drew ahead of
    //  the answer (#326).
    actionHandled: TransportData<TransportHandledAction, never>;
    // The AI clients a computer seat can be given, for the game setup (#604).
    aiClients: TransportData<string[], null>;
    cheat: TransportData<never, TransportCheatData>;
    cheatAdvances: TransportData<string[], string | null>;
    cheatPlayers: TransportData<CheatPlayersResult[], null>;
    cheatUnitTypes: TransportData<string[], null>;
    // What a city can build (#324): the reply is standalone, so it resolves without the game data.
    cityBuildAvailable: TransportData<ObjectMap, string>;
    // What a city can't build, and the ids of the rules that refuse each item (#183).
    cityBuildUnavailable: TransportData<UnavailableBuildItem[], string>;
    chooseFromList: TransportData<ChoiceMeta<keyof ChoiceMetaDataMap>, string>;
    // The player's Civilization Score (#149).
    civilizationScore: TransportData<CivilizationScore, null>;
    // Watching a game nobody here plays (#607): the players to see it as, the one seen as, and whether the turns are
    //  held. Sent whenever any of that changes, before the viewed player's `gameData`.
    observer: TransportData<ObserverState, never>;
    // The page's choice of what to see the game as: some civilisations' game together, or the whole map (#613).
    observe: TransportData<never, { view: ObserverChoice }>;
    // A city a watcher opens, by its square (#613): answered in full, as `investigateCity` is sent, or `null` when
    //  there is none there to open.
    observeCity: TransportData<ObjectMap | null, { x: number; y: number }>;
    // Hold the turns between turns, and let them go again.
    pause: TransportData<never, null>;
    resume: TransportData<never, null>;
    // The civilizations still to be chosen, with their leaders, for the game setup (#604).
    civilizations: TransportData<CivilizationOption[], null>;
    // The difficulty levels the rules offer, for the new game menu (#173).
    difficulties: TransportData<DifficultyOption[], null>;
    // A Diplomat has established an embassy (#58): the civilization it's with, to open the intelligence report on.
    embassyEstablished: TransportData<string, never>;
    // Keep playing after the game has ended (#176).
    gameContinue: TransportData<never, null>;
    // The map as it is sent, not rebuilt: the UI builds its game data from it once, itself (#333).
    gameData: TransportData<ObjectMap, ObjectMap>;
    gameDataPatch: TransportData<DataPatch[], DataPatch[]>;
    gameNotification: TransportData<Notification, Notification>;
    // How the game ended, for the ending window (#176).
    gameOver: TransportData<GameOverDetails, never>;
    // The intelligence report (F3, #58).
    intelligence: TransportData<IntelligenceRow[], null>;
    // A city a Diplomat has investigated (#58), to show read-only.
    investigateCity: TransportData<ObjectMap, never>;
    // Every requirement entry (#37), for the civilopedia (#183).
    getRequirements: TransportData<RequirementData[], null>;
    // Every entry the civilopedia shows (#183).
    getCivilopedia: TransportData<CivilopediaEntry[], null>;
    getOptions: TransportData<
      {
        [key: string]: any;
      },
      string[]
    >;
    // The UI asks for a save and gets the file back to hand to the player;
    // `load` goes the other way, into a worker that has not started a game.
    load: TransportData<null, { data: string }>;
    // The line along the top of the page (`NotificationBar`): text, or a key for the page to translate (#588).
    notification: TransportData<string | TransportTranslatedNotice, never>;
    // A unit's GoTo stopped next to its destination, which offers more than a move (#357): the unit and the tile, to
    //  choose what to do there as the arrow keys would.
    unitHalted: TransportData<{ target: string; unit: string }, never>;
    save: TransportData<null, { name: string }>;
    saveGame: TransportData<{ name: string; data: string }, never>;
    // Game → Retire (#176, #362).
    retire: TransportData<never, null>;
    setOption: TransportData<
      null,
      {
        name: string;
        value: any;
      }
    >;
    setOptions: TransportData<
      null,
      {
        [key: string]: any;
      }
    >;
    start: TransportData<null, null>;
    // A request the worker could not answer, so the page's `request` with its id rejects, rather than waiting for good
    //  (#470).
    requestFailed: TransportData<TransportFailure, never>;
    // A load that failed (#470): the page says so and goes back to the main menu.
    loadFailed: TransportData<{ message: string }, never>;
    // The Top Cities in the World report (#124): the UI asks for up to this many rows.
    topCities: TransportData<TopCitiesRow[], number>;
    // The worker has accepted `EndTurn`: nothing the UI sends is listened for until `turnStarted`.
    turnEnded: TransportData<null, never>;
    // The new turn is in the UI's data and the worker is listening for actions again.
    turnStarted: TransportData<null, never>;
    // The UI asks for the actions of the unit it has made active (#323), by its id. The answer is a `gameDataPatch`.
    unitActions: TransportData<never, string>;
    // Something went wrong in the worker that nothing else answers for (#470): an uncaught error or rejection, a game
    //  that could not start, an action that threw. The page says so. `WorkerTransport` sends the page's own listeners
    //  one for an error the `Worker` itself raises, a request the worker could not answer, and a worker that has said
    //  nothing for a while when a request is waiting on it.
    workerError: TransportData<TransportWorkerError, never>;
    // The worker has started and is listening (#470): until it has said anything, the page can't tell a worker that
    //  has stopped answering from one that is still loading.
    ready: TransportData<null, never>;
    // A sign of life as each player's turn starts (#470), which says no more than that.
    alive: TransportData<null, never>;
  }

  interface TransportPlayerActionMap {
    ActiveUnit: {
      id: string;
      unitAction: string;
      target: string;
    };
    AdjustTradeRates: {
      id: string;
      value: [string, number][];
    };
    // `chosen` starts that build and takes the city off Auto; `auto` puts the city on Auto, or takes it off and leaves
    //  its build as it is (#194).
    ChangeProduction: {
      id: string;
      chosen?: string;
      auto?: boolean;
    };
    ChooseGovernment: {
      id: string;
      chosen: string;
    };
    ChooseResearch: {
      id: string;
      chosen: string;
    };
    ChangeSpecialist: {
      id: string;
    };
    ChangeWorkedTile: {
      id: string;
      tile: string;
    };
    CityBuild: {
      id: string;
      chosen?: string;
      auto?: boolean;
    };
    CompleteProduction: {
      id: string;
      treasury: string;
    };
    EndTurn: {};
    InactiveUnit: {
      id: string;
    };
    LaunchSpaceship: {
      id: string;
    };
    ReassignWorkers: {
      city: string;
    };
    Revolution: {
      id: string;
    };
  }

  interface CheatDataMap {
    GrantAdvance: {
      advances: string[];
      player?: string;
    };
    CreateUnit: {
      player?: string;
      unitType: string;
      x: number;
      y: number;
    };
    GrantGold: {
      amount: number;
      player?: string;
    };
    ModifyUnit: {
      unitId: string;
      properties: {
        attack?: number;
        defence?: number;
        moves?: number;
        movement?: number;
        visibility?: number;
      };
    };
    RevealMap: null;
  }
}

export interface Transport<
  DataMap extends {
    [key: string]: TransportData;
  }
> {
  receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;

  receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;

  request<
    RequestType extends Request,
    Args extends any[] = RequestArgs<RequestType>,
    Return extends any = RequestReturn<RequestType>
  >(
    request: Request
  ): Promise<Return>;

  // The answer to the request `id`, which the page matches it to (#470).
  reply<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>,
    id: RequestId
  ): void;

  send<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>
  ): void;
}

export default Transport;
