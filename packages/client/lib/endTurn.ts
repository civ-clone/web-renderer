import Transport from '../Transport';

declare global {
  interface DocumentEventMap {
    beforeendturn: CustomEvent<void>;
    endturn: CustomEvent<void>;
  }
}

/**
 * Said just before End Turn is sent, by the player or automatically, so whatever is still open can settle first: the
 *  trade rates window sends what it holds, ahead of End Turn, rather than after the turn has gone (#1058).
 */
export const beforeEndTurn = (): void => {
  document.dispatchEvent(new CustomEvent('beforeendturn'));
};

// Every way the player ends their turn goes through here, so anything that lasts "until the end of the turn"
//  (`Notices`) has one event to listen for. Auto end-turn does not: a turn that ends without being played would clear
//  a notice before it was ever seen.
export const endTurn = (transport: Transport): void => {
  beforeEndTurn();

  transport.send('action', {
    name: 'EndTurn',
  });

  document.dispatchEvent(new CustomEvent('endturn'));
};

export default endTurn;
