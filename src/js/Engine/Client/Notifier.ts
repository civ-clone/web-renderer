// The notifications the client sends the player (#449), moved out of `DataTransferClient`: each serialised as it is
//  given, and sent at once or held until the turn is handed over (#130).

import Notification from '../Notification';
import Transport from '../Transport';
import { DataFilter } from './visibilityFilter';
import { standalone } from './refs';

export class Notifier {
  #dataFilter: DataFilter;
  #held: Notification[] = [];
  #holds: () => boolean = () => false;
  #transport: Transport<TransportDataMap>;

  constructor(transport: Transport<TransportDataMap>, dataFilter: DataFilter) {
    this.#transport = transport;
    this.#dataFilter = dataFilter;
  }

  // Notifications given while `predicate` is true are held until `release`.
  holdWhile(predicate: () => boolean): void {
    this.#holds = predicate;
  }

  notify(notification: Notification): void {
    // Serialize with the visibility filter so notification data referencing
    // other players/cities/units is bounded to their Unknown* wrappers rather
    // than dragging (and leaking) their full object graphs over the transport.
    //
    // A notification is reconstituted on its own, not merged into the game
    // data, so it cannot carry refs. It only needs to say who and where: the
    // text reads names and civilizations, and a notice finds its city by id.
    // In full, our own `Player` brought every city, unit and known tile with
    // it: 2 MB and 400 ms per notification in a large game (#130).
    const payload = notification.toPlainObject(
      this.#dataFilter(standalone)
    ) as unknown as Notification;

    // The TurnStart rules, which say what happened in our cities, run before `takeTurn`, and so before the patch with
    //  the new turn in it. Sent straight away, they arrived under the previous turn and year (#130), so they wait for
    //  the handover. Serialised now all the same: they describe the game as it was when they happened.
    if (this.#holds()) {
      this.#held.push(payload);

      return;
    }

    this.#transport.send('gameNotification', payload);
  }

  // Sends what was held, in the order it was given.
  release(): void {
    this.#held
      .splice(0)
      .forEach((notification) =>
        this.#transport.send('gameNotification', notification)
      );
  }
}

export default Notifier;
