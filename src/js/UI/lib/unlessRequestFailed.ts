import { RequestFailed } from '../../Engine/AbstractTransport';

// The end of a request's chain, for a caller that has nothing more to do when the worker could not answer: the player
//  has already been told, in the window `requestRejected` opens (#470), so that failure stops here, and anything else
//  goes on to the console as the surprise it is (#580).
export const unlessRequestFailed = (error: unknown): void => {
  if (error instanceof RequestFailed) {
    return;
  }

  throw error;
};

export default unlessRequestFailed;
