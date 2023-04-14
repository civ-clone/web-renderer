import { Request, RequestArgs, RequestReturn } from './Request';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import { DataPatch } from './DataQueue';
import { GameData, PlayerTreasury } from '../UI/types';
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
    chooseFromList: TransportData<ChoiceMeta<keyof ChoiceMetaDataMap>, string>;
    gameData: TransportData<GameData, ObjectMap>;
    gameDataPatch: TransportData<DataPatch[], DataPatch[]>;
    gameNotification: TransportData<Notification, Notification>;
    getOptions: TransportData<
      {
        [key: string]: any;
      },
      string[]
    >;
    notification: TransportData<string, never>;
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
    ChooseResearch: {
      id: string;
      chosen: string;
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
      chosen: string;
    };
  }

  interface CheatDataMap {
    GrantAdvance: string;
    GrantGold: number;
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
  ): void;

  receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): void;

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
