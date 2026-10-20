// A player brought into a running game (#168), such as a destroyed civilization coming back (#178), asks its host for
//  a client with `player:spawned`. src/js/Engine/Game.ts gives it a computer player's; this does the same for the
//  harnesses, which make their own clients rather than going through `Game`.

import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';

engine.on('player:spawned', (player: Player): void => {
  if (clientRegistryInstance.getBy('player', player).length > 0) {
    return;
  }

  clientRegistryInstance.register(new SimpleAIClient(player));
});
