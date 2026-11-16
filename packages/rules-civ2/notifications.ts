// What Civ2's rules tell a person of their diplomacy (M2d, #1007): civ2-diplomacy's events (a ceasefire run out, an
//  alliance ended, units withdrawn, maps shared, a treaty the Senate forced, a war the person was made to declare, allies
//  joining it, a treaty broken, a refusal overruled), the news of two computer players' treaties and wars, which the
//  original tells a civilization with an embassy with either (`diplomacy.cpp:5872-5896`), and the Eiffel Tower's and the
//  Manhattan Project's effect on reputations (`Rules/relationNotices`). A civilization the person hasn't met isn't
//  named (#59).

import {
  InteractionRegistry,
  instance as interactionRegistryInstance,
} from '@civ-clone/core-diplomacy/InteractionRegistry';
import {
  Notification,
  NotificationContext,
  NotificationTable,
} from '@civ-clone/ui-worker-client/workerRules';
import {
  RuleRegistry,
  instance as ruleRegistryInstance,
} from '@civ-clone/core-rule/RuleRegistry';
import Player from '@civ-clone/core-player/Player';
import { hasEmbassy } from '@civ-clone/base-diplomacy/lib/embassy';

// The news of two other players, for a person with an embassy with either who has met them both.
const news = (
  ctx: NotificationContext,
  key: string,
  player: Player,
  other: Player,
  dependencies: {
    interactionRegistry: InteractionRegistry;
    ruleRegistry: RuleRegistry;
  },
  extra: object = {}
): Notification | null => {
  const reader = ctx.player();

  if (
    ctx.view.owns(player) ||
    ctx.view.owns(other) ||
    !ctx.hasMet(player) ||
    !ctx.hasMet(other) ||
    !(
      hasEmbassy(dependencies, reader, player) ||
      hasEmbassy(dependencies, reader, other)
    )
  ) {
    return null;
  }

  return new Notification(key, { player, other, ...extra }, true);
};

// Ours, the player named one we've met: `them` is named only once met.
const toUs = (
  ctx: NotificationContext,
  key: string,
  us: Player,
  them: Player,
  data: object = {},
  bubble: boolean = false
): Notification | null =>
  !ctx.view.owns(us)
    ? null
    : new Notification(
        ctx.hasMet(them) ? key : `${key}.unmet`,
        { player: them, ...data },
        bubble
      );

export const notifications = (
  dependencies: {
    interactionRegistry: InteractionRegistry;
    ruleRegistry: RuleRegistry;
  } = {
    interactionRegistry: interactionRegistryInstance,
    ruleRegistry: ruleRegistryInstance,
  }
): NotificationTable => [
  [
    'civ2-diplomacy:ceasefire-expired',
    (ctx, computer: Player, person: Player) =>
      toUs(ctx, 'Diplomacy.ceasefire-expired', person, computer),
  ],
  [
    'civ2-diplomacy:alliance-cancelled',
    (ctx, by: Player, against: Player) =>
      ctx.view.owns(by)
        ? toUs(ctx, 'Diplomacy.alliance-ended', by, against)
        : toUs(ctx, 'Diplomacy.alliance-cancelled', against, by),
  ],
  [
    'civ2-diplomacy:units-withdrawn',
    (ctx, computer: Player, person: Player) =>
      toUs(ctx, 'Diplomacy.units-withdrawn', person, computer, {}, true),
  ],
  [
    'civ2-diplomacy:maps-shared',
    (ctx, person: Player, computer: Player) =>
      toUs(ctx, 'Diplomacy.maps-shared', person, computer, {}, true),
  ],
  [
    'civ2-diplomacy:senate-forced-treaty',
    (ctx, person: Player, computer: Player, treaty: string) =>
      toUs(ctx, `Diplomacy.senate-forced-${treaty}`, person, computer),
  ],
  [
    'civ2-diplomacy:refusal-overruled',
    (ctx, computer: Player, person: Player, offer: { constructor: Function }) =>
      toUs(
        ctx,
        `Diplomacy.refusal-overruled.${
          offer?.constructor?.name === 'OfferCeasefire' ? 'ceasefire' : 'peace'
        }`,
        person,
        computer
      ),
  ],
  // A person made to declare war, by an attack across a treaty or on someone they had met and weren't at war with
  //  (civ2-unit's forced war), or by a treaty they broke: the war, and the other side's allies joining it.
  [
    'civ2-diplomacy:war-declared',
    (ctx, by: Player, against: Player) =>
      ctx.view.owns(by)
        ? toUs(ctx, 'Diplomacy.war-declared', by, against)
        : toUs(ctx, 'Diplomacy.war-declared-on-us', against, by),
  ],
  [
    'civ2-diplomacy:ally-joins-war',
    (ctx, ally: Player, by: Player, against: Player) =>
      ctx.view.owns(by)
        ? toUs(ctx, 'Diplomacy.ally-joins-war', by, ally, {
            against: ctx.hasMet(against) ? against : null,
          })
        : ctx.view.owns(against)
        ? toUs(ctx, 'Diplomacy.ally-joins-our-war', against, ally, {
            enemy: ctx.hasMet(by) ? by : null,
          })
        : null,
  ],
  // civ2-enhanced's: a computer player breaking a treaty openly.
  [
    'civ2-diplomacy:treaty-broken',
    (ctx, computer: Player, other: Player) =>
      toUs(ctx, 'Diplomacy.treaty-broken', other, computer),
  ],
  [
    'civ2-diplomacy:computers-made-peace',
    (ctx, player: Player, other: Player) =>
      news(ctx, 'Diplomacy.computers-made-peace', player, other, dependencies),
  ],
  [
    'civ2-diplomacy:computers-went-to-war',
    (ctx, player: Player, other: Player) =>
      news(ctx, 'Diplomacy.computers-went-to-war', player, other, dependencies),
  ],
  [
    'civ2-diplomacy:computers-allied',
    (ctx, player: Player, other: Player) =>
      news(ctx, 'Diplomacy.computers-allied', player, other, dependencies),
  ],
  [
    'civ2-diplomacy:computers-ended-alliance',
    (ctx, player: Player, other: Player) =>
      news(
        ctx,
        'Diplomacy.computers-ended-alliance',
        player,
        other,
        dependencies
      ),
  ],
  [
    'civ2-diplomacy:contact-lapsed',
    (ctx, player: Player, other: Player) =>
      news(ctx, 'Diplomacy.contact-lapsed', player, other, dependencies),
  ],
  // The Eiffel Tower's and the Manhattan Project's effect on reputations: ours.
  [
    'civ2:reputation-restored',
    (ctx, player: Player) =>
      !ctx.view.owns(player)
        ? null
        : new Notification('Diplomacy.reputation-restored', { player }),
  ],
  [
    'civ2:reputations-halved',
    (ctx, player: Player) =>
      !ctx.view.owns(player)
        ? null
        : new Notification('Diplomacy.reputations-halved', { player }, true),
  ],
];

export default notifications;
