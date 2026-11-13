import AIClient from '@civ-clone/core-ai-client/AIClient';

// A computer player that ends every turn without doing anything (civ-clone/web-renderer#1008). With only these, a
//  game is played by its rule set alone: `tools/soak.js --clients end-turn` shows a set can run a whole game before
//  any AI knows it. It's an `AIClient`, so the rules that wait for a human (Keep playing at the game's end) don't
//  wait for it. Its choices are the base `Client`'s: one at random, from the seeded source.
export class EndTurnClient extends AIClient {
  async takeTurn(): Promise<void> {}
}

export default EndTurnClient;
