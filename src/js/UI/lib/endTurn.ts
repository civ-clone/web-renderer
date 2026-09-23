import Transport from '../Transport';

declare global {
  interface DocumentEventMap {
    endturn: CustomEvent<void>;
  }
}

// Every way the player ends their turn goes through here, so anything that lasts "until the end of the turn"
//  (`Notices`) has one event to listen for. Auto end-turn does not: a turn that ends without being played would clear
//  a notice before it was ever seen.
export const endTurn = (transport: Transport): void => {
  transport.send('action', {
    name: 'EndTurn',
  });

  document.dispatchEvent(new CustomEvent('endturn'));
};

export default endTurn;
