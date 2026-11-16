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
 * Opens talks with the civilization the UI names, under rules where a person can (`mayOpenTalks`, asked as they
 *  start), and waits for them: the turn doesn't end while they're open, as it doesn't for a Meet with Leader's. Never
 *  ends the turn.
 */
export const handleOpenTalks = (
  ctx: ActionContext,
  { civilization }: { civilization?: unknown }
): Promise<boolean> => {
  const other = talksWith(ctx, civilization);

  if (other === null || !currentWorkerRules()?.mayOpenTalks) {
    console.warn(`talks with ${String(civilization)} can't be opened`);

    return Promise.resolve(false);
  }

  // The talks ask the rules as they start, and say so if they can't be opened.
  ctx.talks.openTalks(other);

  return ctx.talks.pending.then(
    () => false,
    () => false
  );
};

export default handleOpenTalks;
