// Talks a person opens with a computer player under Civ2's rules (M2d, #1007), from the Foreign Advisor, as the
//  original's foreign minister sends an emissary (OpenCiv2 `src/auto/reports.cpp` `foreign_minister_show`,
//  richardpenman/civ2@e39fe7b): to any civilization it lists, which is one it is in contact with, or every one while it
//  sees them all. It asks for no embassy and no Diplomat; whether the computer player receives the emissary is the
//  talks' own first step (civ2-diplomacy's rows).

import {
  ClientRegistry,
  instance as clientRegistryInstance,
} from '@civ-clone/core-client/ClientRegistry';
import { Contact } from '@civ-clone/library-diplomacy/Interactions';
import Player from '@civ-clone/core-player/Player';
import { RelationRegistries } from '@civ-clone/ui-worker-client/workerRules';
import { hasEmbassy } from '@civ-clone/base-diplomacy/lib/embassy';
import isBarbarian from '@civ-clone/base-civilization-barbarian/isBarbarian';
import isHuman from '@civ-clone/civ2-difficulty/isHuman';

/**
 * Whether `person` may send an emissary to `other`: a computer player, not the barbarians, that it is in contact with,
 *  or has an embassy with by a Wonder's rule (Marco Polo's Embassy or the United Nations: `HasEmbassy`), which is how
 *  the original sees every civilization. The original also lists everyone once anybody has built the United Nations;
 *  here only its owner does.
 */
export const mayOpenTalks = (
  person: Player,
  other: Player,
  { interactionRegistry, ruleRegistry }: RelationRegistries,
  clientRegistry: ClientRegistry = clientRegistryInstance
): boolean =>
  person !== other &&
  !isBarbarian(other) &&
  isHuman(person, clientRegistry) &&
  !isHuman(other, clientRegistry) &&
  (interactionRegistry
    .getByPlayers(person, other)
    .some((interaction) => interaction instanceof Contact) ||
    hasEmbassy({ interactionRegistry, ruleRegistry }, person, other));

/** The engine events by which a computer player asks for an audience with a person (civ2-diplomacy's turn start). */
export const audienceEvents = ['civ2-diplomacy:audience-due'];
