import Request from '../Request';

export type CheatPlayersResult = {
  id: string;
  civilization: string;
  isLocal: boolean;
};

export class CheatPlayers extends Request<[null], CheatPlayersResult[]> {
  constructor() {
    super('cheatPlayers', null);
  }
}

export default CheatPlayers;
