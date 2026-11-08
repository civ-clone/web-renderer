// Battles, for their sound (#126). The engine says what each unit sounds like (`attackSound`, a list of words a sound
//  pack knows, most specific first); this decides, as Civ1 does (v474.05, `BATTLE.C`), which unit's is heard and
//  whether it's the won or lost version, both of which depend on who is watching:
//
// - In a battle of the player's own, the winner's sound, in the version for how it went for the player.
// - In anyone else's, the attacker's, in the version for how it went for the attacker. (Civ1 plays the winner's sound,
//    always lost, as nobody watching won.)
//
// Heard when the player is in the battle, or, in anyone else's, when one of the player's units has either side in
//  sight, as Civ1 hears it: within the unit's Visibility, the squares its moves reveal (`Unit.applyVisibility`).

import Action from '@civ-clone/core-unit/Action';
import Engine from '@civ-clone/core-engine/Engine';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';
import { ClientContext, Disposer } from './ClientContext';
import { BattleSound } from '@civ-clone/ui-protocol/battles';

export type BattleEventsContext = Pick<
  ClientContext,
  'view' | 'transport' | 'units'
>;

/** Whether one of the player's units has `tile` in sight now. */
export const inSight = (
  tile: Tile,
  ctx: Pick<BattleEventsContext, 'view' | 'units'>
): boolean =>
  ctx.view
    .owners()
    .some((player) =>
      ctx.units
        .getByPlayer(player)
        .some(
          (unit) =>
            !unit.destroyed() &&
            unit
              .tile()
              .getSurroundingArea(unit.visibility().value())
              .includes(tile)
        )
    );

/** The sound `unit` makes, as the rules registered give it, or `null` for none. */
export const attackSoundOf = (unit: Unit): string[] | null => {
  const data = additionalDataRegistryInstance
    .getByType(Unit)
    .find((additionalData) => additionalData.key() === 'attackSound');

  if (!data) {
    return null;
  }

  try {
    const sound = data.data(unit);

    return Array.isArray(sound) &&
      sound.length > 0 &&
      sound.every((word) => typeof word === 'string')
      ? sound
      : null;
  } catch (error) {
    // Quiet, rather than stopping the attack, but not unnoticed.
    console.error(error);

    return null;
  }
};

/** What the player hears of a battle `attacker` fought `defender` in, or `null` for nothing. */
export const battleSound = (
  attacker: Unit,
  defender: Unit,
  attackerWon: boolean,
  ctx: Pick<BattleEventsContext, 'view' | 'units'>,
  soundOf: (unit: Unit) => string[] | null = attackSoundOf
): BattleSound | null => {
  const attacking = ctx.view.owns(attacker.player()),
    defending = ctx.view.owns(defender.player()),
    // Both sides the player's own (a view of several), or neither: nobody's side to take.
    neutral = attacking === defending;

  if (
    neutral &&
    !inSight(attacker.tile(), ctx) &&
    !inSight(defender.tile(), ctx)
  ) {
    return null;
  }

  const winner = attackerWon ? attacker : defender,
    sound = soundOf(neutral ? attacker : winner);

  if (sound === null) {
    return null;
  }

  return {
    sound,
    won: neutral ? attackerWon : attacking === attackerWon,
  };
};

export const registerBattleEvents = (
  engine: Pick<Engine, 'on' | 'off'>,
  ctx: BattleEventsContext,
  soundOf: (unit: Unit) => string[] | null = attackSoundOf
): Disposer => {
  // `unit:defeated` is emitted twice for each defeat (civ-clone/civ1-city#19): a battle is heard once.
  const heard = new WeakSet<Unit>(),
    listener = (loser: Unit, winner: Unit, action?: Action): void => {
      if (!action || heard.has(loser)) {
        return;
      }

      const attacker = action.unit();

      // Not a battle: a unit defeated some other way.
      if (attacker !== loser && attacker !== winner) {
        return;
      }

      heard.add(loser);

      // Heard inside the attack, which a failure here would stop: a battle not heard is only quiet.
      try {
        const sound = battleSound(
          attacker,
          attacker === loser ? winner : loser,
          attacker === winner,
          ctx,
          soundOf
        );

        if (sound !== null) {
          ctx.transport.send('battle', sound);
        }
      } catch (error) {
        console.error(error);
      }
    };

  engine.on('unit:defeated', listener);

  return (): void => engine.off('unit:defeated', listener);
};

export default registerBattleEvents;
