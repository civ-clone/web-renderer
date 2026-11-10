// What the player has asked their cities to choose by themselves (#690, #691): the page keeps it with its options and
//  sends it as the game starts or loads, and whenever it changes; the ruleset's rules act on it. Not saved with the
//  game, as the page's options aren't. They are the game's own (`game.buildPreferences`, #873), which its rules act on.

import { BuildPreferencesRegistry } from '@civ-clone/core-city-build/BuildPreferencesRegistry';
import Transport, {
  TransportDisposer,
} from '@civ-clone/core-data-client/Transport';
import { ClientContext } from './ClientContext';
import { defaultGame } from '@civ-clone/core-game/defaultGame';

export type BuildPreferencesContext = Pick<ClientContext, 'player'>;

export const registerBuildPreferences = (
  transport: Transport<TransportDataMap>,
  ctx: BuildPreferencesContext,
  buildPreferencesRegistry: BuildPreferencesRegistry = defaultGame.buildPreferences
): TransportDisposer =>
  transport.receive('buildPreferences', ({ firstBuild, repeat }): void =>
    buildPreferencesRegistry.set(ctx.player(), {
      firstBuild: firstBuild === true,
      repeat: repeat === true,
    })
  );

export default registerBuildPreferences;
