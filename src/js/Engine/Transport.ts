import { Request, RequestArgs, RequestReturn } from './Request';
import { CheatPlayersResult } from './Requests/CheatPlayers';
import { IntelligenceRow } from './lib/intelligence';
import { TopCitiesRow } from './lib/topCities';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import { DataPatch } from './DataQueue';
import { GameData } from '../UI/types';
import Notification from './Notification';
import { ObjectMap } from '../UI/lib/reconstituteData';

export type TransportMessage<
  Channel extends keyof TransportDataMap = keyof TransportDataMap
> = {
  channel: Channel;
  data: TransportReceiveArgs<TransportDataMap[Channel]>;
};

export type TransportData<Send = any, Receive = any> = {
  send: Send;
  receive: Receive;
};

export type TransportSendArgs<Data extends TransportData> =
  Data extends TransportData<infer Send> ? Send : never;

export type TransportReceiveArgs<Data extends TransportData> =
  Data extends TransportData<any, infer Receive> ? Receive : never;

export type TransportReceiveHandler<Data extends TransportData> = (
  data: TransportReceiveArgs<Data>,
  rawData?: ObjectMap
) => void;

export type TransportDisposer = () => void;

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
    cheat: TransportData<never, TransportCheatData>;
    cheatAdvances: TransportData<string[], string | null>;
    cheatPlayers: TransportData<CheatPlayersResult[], null>;
    // What a city can build (#324): the reply is standalone, so it resolves without the game data.
    cityBuildAvailable: TransportData<ObjectMap, string>;
    chooseFromList: TransportData<ChoiceMeta<keyof ChoiceMetaDataMap>, string>;
    // A Diplomat has established an embassy (#58): the civilization it's with, to open the intelligence report on.
    embassyEstablished: TransportData<string, never>;
    gameData: TransportData<GameData, ObjectMap>;
    gameDataPatch: TransportData<DataPatch[], DataPatch[]>;
    gameNotification: TransportData<Notification, Notification>;
    // The intelligence report (F3, #58).
    intelligence: TransportData<IntelligenceRow[], null>;
    // A city a Diplomat has investigated (#58), to show read-only.
    investigateCity: TransportData<ObjectMap, never>;
    getOptions: TransportData<
      {
        [key: string]: any;
      },
      string[]
    >;
    // The UI asks for a save and gets the file back to hand to the player;
    // `load` goes the other way, into a worker that has not started a game.
    load: TransportData<null, { data: string }>;
    notification: TransportData<string, never>;
    save: TransportData<null, { name: string }>;
    saveGame: TransportData<{ name: string; data: string }, never>;
    quit: TransportData<null, null>;
    restart: TransportData<null, null>;
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
    // The Top Cities in the World report (#124): the UI asks for up to this many rows.
    topCities: TransportData<TopCitiesRow[], number>;
    // The worker has accepted `EndTurn`: nothing the UI sends is listened for until `turnStarted`.
    turnEnded: TransportData<null, never>;
    // The new turn is in the UI's data and the worker is listening for actions again.
    turnStarted: TransportData<null, never>;
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
    ChangeProduction: {
      id: string;
      chosen: string;
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
      chosen: string;
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

  send<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>
  ): void;
}

export default Transport;
