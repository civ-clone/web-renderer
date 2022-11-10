import { Client, IClient } from '@civ-clone/core-civ-client/Client';
import Civilization from '@civ-clone/core-civilization/Civilization';
import Player from '@civ-clone/core-player/Player';
export declare class DataTransferClient extends Client implements IClient {
  #private;
  constructor(
    player: Player,
    sender: (channel: string, payload: any) => void,
    receiver: (channel: string, handler: (...args: any[]) => void) => void
  );
  chooseCivilization(Civilizations: typeof Civilization[]): Promise<void>;
  chooseLeader(civilization: Civilization): Promise<void>;
  handleAction(...args: any[]): boolean;
  private sendInitialData;
  private sendPatchData;
  private sendNotification;
  takeTurn(): Promise<void>;
}
export default DataTransferClient;
