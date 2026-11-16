// Talks the player opens with another civilization from the Foreign Advisor (M2d, #1007), under rules where a person
//  can (`WorkerRules.mayOpenTalks`, Civ2's): the UI names the civilization, as the Intelligence Report keys its rows.

import { ActionContext } from './ActionContext';
import Player from '@civ-clone/core-player/Player';
import { currentWorkerRules } from '../../workerRules';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

/** The other player the UI means: the one whose civilization is `civilization`, met and not the player. */
export const talksWith = (
  ctx: Pick<ActionContext, 'player' | 'players' | 'hasMet'>,
  civilization: unknown
): Player | null =>
  ctx.players
    .entries()
    .find(
      (player: Player) =>
        player !== ctx.player() &&
        player.civilization() !== null &&
        typeNameOf(player.civilization().sourceClass()) === civilization &&
        ctx.hasMet(player)
    ) ?? null;

/**
 * Opens talks with the civilization the UI names, if the rules let the player (`mayOpenTalks`), and waits for them:
 *  the turn doesn't end while they're open, as it doesn't for a Meet with Leader's. Never ends the turn.
 */
export const handleOpenTalks = (
  ctx: ActionContext,
  { civilization }: { civilization?: unknown }
): Promise<boolean> => {
  const other = talksWith(ctx, civilization),
    mayOpenTalks = currentWorkerRules()?.mayOpenTalks;

  if (
    other === null ||
    !mayOpenTalks ||
    !mayOpenTalks(ctx.player(), other, {
      interactionRegistry: ctx.interactions,
      ruleRegistry: ctx.rules,
      turn: ctx.turn,
    })
  ) {
    console.warn(`talks with ${String(civilization)} can't be opened`);

    return Promise.resolve(false);
  }

  ctx.talks.openTalks(other);

  return ctx.talks.pending.then(
    () => false,
    () => false
  );
};

export default handleOpenTalks;
