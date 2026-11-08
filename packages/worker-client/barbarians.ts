import { Attila } from '@civ-clone/base-civilization-barbarian/Leaders';
import Barbarian from '@civ-clone/base-civilization-barbarian/Barbarian';
import { Game } from '@civ-clone/core-game';
import { SaveableClass } from '@civ-clone/core-data-object/ClassRegistry';

/**
 * Register the barbarians' classes a save can name (#169), as `registerDiplomacyClasses` does the diplomacy ones.
 *
 * `registerClasses` names every civilization and leader in the registries, and the barbarians are deliberately in
 * neither: a civilization there is offered to players, drawn for a player added mid-game and brought back for a
 * destroyed one. So a save with the barbarian player in it names two classes nothing else registers.
 */
export const registerBarbarianClasses = (game: Game): void =>
  game.classes.register(...([Barbarian, Attila] as unknown as SaveableClass[]));

export default registerBarbarianClasses;
