// What Civ2's rules tell a person of Diplomats, Spies and Caravans (M2d part 2, #1007): water poisoned, an agent caught
//  or lost, a nuclear device set off or found out, what an espionage incident came to, a Senate's scandal, and a
//  Caravan's or Freight's delivery, which pays research as well as gold. A theft, a sabotage, an incited city and a
//  bribed unit are told by the shared notices, as Civ1's are. A civilization the person hasn't met isn't named (#59).

import {
  Notification,
  NotificationContext,
  NotificationTable,
} from '@civ-clone/ui-worker-client/workerRules';
import Action from '@civ-clone/core-unit/Action';
import City from '@civ-clone/core-city/City';
import EstablishEmbassy from '@civ-clone/base-unit-action-establish-embassy/EstablishEmbassy';
import InvestigateCity from '@civ-clone/base-unit-action-investigate-city/InvestigateCity';
import Player from '@civ-clone/core-player/Player';
import Unit from '@civ-clone/core-unit/Unit';
import { isSpy } from '@civ-clone/civ2-unit/lib/espionage';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

// `key`, or its `.unmet` form when `player` hasn't been met.
const naming = (ctx: NotificationContext, key: string, player: Player) =>
  ctx.hasMet(player) ? key : `${key}.unmet`;

const unitName = (unit: Unit): { _: string } => ({
  _: typeNameOf(unit.sourceClass()),
});

// The incidents a perpetrator is told of, by civ2-diplomacy's outcome: `none` and `offered` (which is asked of the
//  victim, `incidentOffer`) aren't.
const incidentOutcomes = [
  'attitude',
  'terror',
  'war',
  'alliance-cancelled',
  'wimp-out',
];

export const espionageNotices = (): NotificationTable => [
  // Water poisoned (civ2-unit): the city's owner and the poisoner are told.
  [
    'city:water-poisoned',
    (ctx: NotificationContext, city: City, poisoner: Player) =>
      ctx.view.owns(poisoner)
        ? new Notification('Espionage.water-poisoned-by-us', { city })
        : ctx.view.owns(city.player())
        ? new Notification(naming(ctx, 'Espionage.water-poisoned', poisoner), {
            city,
            player: poisoner,
          })
        : null,
  ],

  // An agent caught before its mission, or one that didn't come back from it (a Spy that failed to escape): told to its
  //  player, and a catch to the city's owner too. A Diplomat used up as missions always use it, and an agent used up
  //  by an embassy or an investigation, aren't news.
  [
    'civ2:agent-lost',
    (
      ctx: NotificationContext,
      unit: Unit,
      city: City | null,
      mission: Action,
      caught: boolean
    ) => {
      if (ctx.view.owns(unit.player())) {
        if (caught) {
          return new Notification(
            city === null
              ? 'Espionage.agent-caught-at-unit'
              : 'Espionage.agent-caught',
            { city, unit: unitName(unit) }
          );
        }

        return isSpy(unit) &&
          !(mission instanceof EstablishEmbassy) &&
          !(mission instanceof InvestigateCity)
          ? new Notification('Espionage.agent-lost', {
              city,
              unit: unitName(unit),
            })
          : null;
      }

      return caught && city !== null && ctx.view.owns(city.player())
        ? new Notification(
            naming(ctx, 'Espionage.foreign-agent-caught', unit.player()),
            { city, player: unit.player(), unit: unitName(unit) }
          )
        : null;
    },
  ],

  // Our own device set off; everyone else hears of a nuclear detonation as of any other (`unit:nuclear-detonation`).
  [
    'civ2:device-planted',
    (ctx: NotificationContext, unit: Unit, city: City) =>
      ctx.view.owns(unit.player())
        ? new Notification('Espionage.device-planted', { city })
        : null,
  ],

  // A planted device found out (civ2-diplomacy): every civilization in contact with its planter goes to war with it.
  [
    'civ2-diplomacy:nuclear-device-discovered',
    (ctx: NotificationContext, player: Player, enemies: Player[]) =>
      ctx.view.owns(player)
        ? new Notification('Espionage.device-discovered-ours', {})
        : enemies.some((enemy) => ctx.view.owns(enemy))
        ? new Notification(
            naming(ctx, 'Espionage.device-discovered', player),
            { player },
            true
          )
        : null,
  ],

  // What an espionage incident came to (civ2-diplomacy), told to whichever of the two is ours.
  [
    'civ2-diplomacy:espionage-incident',
    (
      ctx: NotificationContext,
      perpetrator: Player,
      victim: Player,
      outcome: string
    ) => {
      if (!incidentOutcomes.includes(outcome)) {
        return null;
      }

      if (ctx.view.owns(perpetrator)) {
        return new Notification(
          naming(ctx, `Diplomacy.incident.${outcome}`, victim),
          { player: victim }
        );
      }

      return ctx.view.owns(victim)
        ? new Notification(
            naming(
              ctx,
              `Diplomacy.incident-against-us.${outcome}`,
              perpetrator
            ),
            { player: perpetrator }
          )
        : null;
    },
  ],

  // A Senate's scandal (civ2-government), from an incident or a refused withdrawal: the government falls.
  [
    'civ2-government:senate-scandal',
    (ctx: NotificationContext, player: Player, other: Player | null) =>
      !ctx.view.owns(player)
        ? null
        : other
        ? new Notification(naming(ctx, 'Diplomacy.senate-scandal', other), {
            player: other,
          })
        : new Notification('Diplomacy.senate-scandal.unmet', {}),
  ],

  // A delivery pays its bonus in gold and as much again in research (civ2-city): told in place of the shared notice,
  //  which speaks of coins alone.
  [
    'unit:trade-route-established',
    (
      ctx: NotificationContext,
      player: Player,
      home: City,
      city: City,
      goods: string,
      bonus: number
    ) =>
      !ctx.view.owns(player)
        ? null
        : new Notification('Unit.trade-route-delivered', {
            bonus,
            city,
            goods,
            home,
          }),
  ],
];

export default espionageNotices;
