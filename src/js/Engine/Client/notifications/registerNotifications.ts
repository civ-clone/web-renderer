// The engine events the client tells the player about (#449): each table's handlers registered as engine listeners,
//  and a notice sent for each one a handler makes.
//
// The client registers these after its own listeners, so for an event that changes the game as well (a city captured,
//  a nuclear detonation, a trade route, a build complete, an advance discovered, an improvement obsolete, a goody hut),
//  the patches are queued before the notice is sent, as they were when one listener did both. Notices go out at once
//  and patches at the next flush, and none of these listeners flushes, so what is sent, and when, is as it was.

import Engine from '@civ-clone/core-engine/Engine';
import { NotificationContext, NotificationTable } from './NotificationContext';
import Notification from '../../Notification';
import cityNotifications from './city';
import diplomatNotifications from './diplomat';
import playerNotifications from './player';
import unitNotifications from './unit';

export const notificationTables: NotificationTable[] = [
  cityNotifications,
  unitNotifications,
  diplomatNotifications,
  playerNotifications,
];

// The order the client registered these listeners in when they were part of it, kept. Only the order of one event's
//  listeners makes a difference, and each event has one here, but this keeps it plain that nothing has moved.
export const registrationOrder: string[] = [
  'city:captured',
  'unit:nuclear-detonation',
  'city:polluted',
  'city:sdi-protected',
  'unit:lost-at-sea',
  'unit:unsupported',
  'city:unsupported-improvement',
  'unit:trade-route-established',
  'player:advance-stolen',
  'city:sabotaged',
  'city:incited',
  'unit:bribed',
  'city:building-complete',
  'player:research-complete',
  'wonder:obsolete',
  'city-improvement:obsolete',
  'goody-hut:action-performed',
  'game:retirement-warning',
  'player:defeated',
  'city:civil-disorder',
  'city:order-restored',
  'player:government:collapsed',
  'city:leader-celebration',
  'city:leader-celebration-ended',
  'player:respawned',
  'player:spaceship:part-built',
  'player:spaceship:lost',
  'player:spaceship:landed',
  'player:declaration-expired',
];

export const registerNotifications = (
  engine: Pick<Engine, 'on' | 'off'>,
  ctx: NotificationContext,
  notifier: { notify(notification: Notification): void }
): (() => void) => {
  const handlers = notificationTables.flat();

  handlers.forEach(([event]) => {
    if (!registrationOrder.includes(event)) {
      throw new TypeError(`No registration order for '${event}'.`);
    }
  });

  const listeners = registrationOrder.flatMap((event) =>
    handlers
      .filter(([handlerEvent]) => handlerEvent === event)
      .map(([, handler]): [string, (...args: any[]) => void] => {
        const listener = (...args: any[]): void => {
          const notification = handler(ctx, ...args);

          if (notification !== null) {
            notifier.notify(notification);
          }
        };

        engine.on(event, listener);

        return [event, listener];
      })
  );

  return () =>
    listeners.forEach(([event, listener]) => engine.off(event, listener));
};

export default registerNotifications;
