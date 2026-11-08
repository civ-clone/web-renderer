// What the notification handlers read (#449): the player they are for, and the little of the game a notice depends
//  on, so that each handler can be checked with plain data.

import { ClientContext } from '../ClientContext';
import Notification from '@civ-clone/ui-protocol/Notification';

export type NotificationContext = Pick<
  ClientContext,
  | 'player'
  // Which players are our own, whose events are told as ours.
  | 'view'
  // Whether we have met a player, which says whether a notice may name them (#59).
  | 'hasMet'
  // Whether we have seen a square, which says whether a rival's wonder is told with its city (#43).
  | 'hasSeen'
  // The units on a square: a goody hut is told to the player whose unit found it.
  | 'unitsOn'
  // A player's government, which says how its collapse is told.
  | 'government'
>;

// An engine event's arguments as the notice it is told as, or `null` for none. A build complete can be two: the
//  completion, and what the queue dropped on its way to the next item (#774).
export type NotificationHandler = (
  ctx: NotificationContext,
  ...args: any[]
) => Notification | Notification[] | null;

export type NotificationTable = [string, NotificationHandler][];
