import Transport from '../../client/Transport';
export interface IGame {
  start(): void;
}
export declare class Game implements IGame {
  #private;
  constructor(transport: Transport);
  private bindEvents;
  start(): void;
}
export default Game;
