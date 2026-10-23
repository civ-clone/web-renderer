// What a Diplomat's missions open for the player (#449), moved out of `DataTransferClient`: the intelligence report
//  for an embassy established, and the city a Diplomat investigated. What the player is told of a mission is in
//  `notifications/diplomat.ts`, and the talks a Meet with King starts are in `Talks.ts`.

import City from '@civ-clone/core-city/City';
import Engine from '@civ-clone/core-engine/Engine';
import Player from '@civ-clone/core-player/Player';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import { ClientContext, Disposer } from './ClientContext';
import cityInFull from './cityInFull';

export type DiplomatEventsContext = Pick<
  ClientContext,
  // Which players are our own, and what is known of each square.
  | 'view'
  | 'transport'
  // What the player may see, which an investigated city's tiles go through.
  | 'dataFilter'
>;

export const registerDiplomatEvents = (
  engine: Pick<Engine, 'on' | 'off'>,
  ctx: DiplomatEventsContext
): Disposer => {
  const listeners: [string, (...args: any[]) => void][] = [],
    on = (event: string, listener: (...args: any[]) => void): void => {
      engine.on(event, listener);

      listeners.push([event, listener]);
    };

  // The report opens on the civilization the embassy is with, as v474.05 opens it.
  on('player:embassy-established', (holder: Player, host: Player) => {
    if (!ctx.view.owns(holder)) {
      return;
    }

    ctx.transport.send(
      'embassyEstablished',
      typeNameOf(host.civilization().sourceClass())
    );
  });

  // The city is sent once, in full, as its owner would see it (`cityInFull`).
  on('city:investigated', (city: City, player: Player) => {
    if (!ctx.view.owns(player)) {
      return;
    }

    ctx.transport.send('investigateCity', cityInFull(city, ctx) as never);
  });

  return (): void =>
    listeners.forEach(([event, listener]) => engine.off(event, listener));
};

export default registerDiplomatEvents;
