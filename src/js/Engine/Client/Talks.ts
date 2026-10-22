// Talks with other players (#449), moved out of `DataTransferClient`: the players our units have moved next to, the
//  talks a Diplomat's Meet with King starts, and each negotiation, a step at a time, each step chosen by the player
//  whose step it is.
//
// The talks are one promise chain. The action that started them waits for it and then offers talks with the players
//  met on the way, inside the client's flush hold, so a talk's prompt goes out before the patch of the move that
//  started it. The hand-over adds the talks with anyone met by a GoTo carried on at the start of the turn.

import { ChoiceMeta } from '@civ-clone/core-client/ChoiceMeta';
import AIClient from '@civ-clone/core-ai-client/AIClient';
import Engine from '@civ-clone/core-engine/Engine';
import { IAction } from '@civ-clone/core-diplomacy/Negotiation/Action';
import { IInteraction } from '@civ-clone/core-diplomacy/Interaction';
import Initiate from '@civ-clone/core-diplomacy/Negotiation/Initiate';
import Terminate from '@civ-clone/core-diplomacy/Negotiation/Terminate';
import Negotiation from '@civ-clone/core-diplomacy/Negotiation';
import Player from '@civ-clone/core-player/Player';
import Resolution from '@civ-clone/core-diplomacy/Proposal/Resolution';
import Unit from '@civ-clone/core-unit/Unit';
import { choosers } from '@civ-clone/simple-ai-client/lib/Diplomacy/negotiate';
import mayNegotiate from '@civ-clone/library-diplomacy/lib/mayNegotiate';
import Automation from './Automation';
import { ClientContext, Disposer } from './ClientContext';
import Timeout from '../Error/Timeout';
import { awaitTimeout } from './refs';
import { describeError } from '../answer';

export type TalksContext = Pick<
  ClientContext,
  | 'player'
  // Whose client chooses each step: ours, or a computer player's.
  | 'clients'
  | 'interactions'
  // The player's treasuries and research, which the talks can change without an event to say so (#492).
  | 'patches'
  | 'rules'
  // Talks given up on are said, as `workerError` (#470).
  | 'transport'
  | 'turn'
  // The units next to one of ours that has moved.
  | 'units'
>;

// How many rounds in a row the talks may go without a step before they are ended (see `#negotiate`).
export const maxStalledRounds = 3;

export class Talks {
  #context: TalksContext;
  // The other players our units have moved next to since talks were last offered (#357): by hand, on a GoTo, or on a
  //  GoTo carried on at the start of the turn.
  #metOnTheWay: Set<Player> = new Set();
  // Talks a Diplomat's Meet with King started (#58), which the action that started them waits for, as it waits for
  //  talks with units met on the way (`talkToPlayersMet`).
  #talks: Promise<void> = Promise.resolve();
  // How many of the links in `#talks` have yet to settle: talks are under way while any has (#491).
  #unsettled: number = 0;

  constructor(context: TalksContext) {
    this.#context = context;
  }

  get metOnTheWay(): Set<Player> {
    return this.#metOnTheWay;
  }

  // The talks under way, for an action to wait for before it offers talks with the players met on the way.
  get pending(): Promise<void> {
    return this.#talks;
  }

  // Whether `pending` has yet to settle: a Meet with King's talks, or those at the start of the turn, are open. `EndTurn`
  //  waits for them (`handleAction.ts`). Counted, as a promise can't be asked whether it has settled.
  get underWay(): boolean {
    return this.#unsettled > 0;
  }

  player(): Player {
    return this.#context.player();
  }

  // The players next to one of our units that has moved, to offer talks with once the action is over.
  meetNeighboursOf(unit: Unit): void {
    unit
      .tile()
      .getNeighbours()
      .forEach((tile) =>
        this.#context.units.getByTile(tile).forEach((tileUnit) => {
          if (tileUnit.player() !== this.player()) {
            this.#metOnTheWay.add(tileUnit.player());
          }
        })
      );
  }

  // Each link of the chain catches what its talks threw, so one that fails doesn't fail every talk after it, and every
  //  action that waits for them (#470).
  meetWithKing(other: Player): void {
    this.#talks = this.#talks
      .then(() => this.handleNegotiation(other))
      .then(
        () => {},
        (error) => console.error(error)
      );

    this.#countUntilSettled();
  }

  handOver(): void {
    // Anyone met by a GoTo carried on at the start of the turn.
    this.#talks = this.#talks
      .then(() => this.talkToPlayersMet())
      .catch((error) => console.error(error));

    this.#countUntilSettled();
  }

  // Counts the link just added to `#talks` until it settles, either way. Off to one side, so the chain an action waits
  //  for is as it was. Registered as the link is added, it runs before anything that waits for the link.
  #countUntilSettled(): void {
    const settled = (): void => {
      this.#unsettled--;
    };

    this.#unsettled++;

    this.#talks.then(settled, settled);
  }

  // TODO: This is duplicated between here and SimpleAIClient, this should be re-usable.
  // Offers talks with each player a unit of ours has moved next to since the last time (`#metOnTheWay`), if they may
  //  talk now (`MayNegotiate`).
  async talkToPlayersMet(): Promise<void> {
    // TODO: This could be a `Rule`.
    const surroundingPlayers = Array.from(this.#metOnTheWay);

    this.#metOnTheWay.clear();

    if (surroundingPlayers.length === 0) {
      return;
    }

    await surroundingPlayers
      // How often players talk is the ruleset's to say (`MayNegotiate`).
      .filter((player) =>
        mayNegotiate(
          player,
          this.player(),
          this.#context.rules,
          this.#context.interactions,
          this.#context.turn
        )
      )
      .reduce(
        (promise, player): Promise<any> =>
          promise.then(() => this.handleNegotiation(player)),
        Promise.resolve()
      );
  }

  // Gold given or taken in the talks moves without an event to say so (`civ1-diplomacy`'s `give`), so the player's
  //  treasuries and research are compared before and after, and what changed is sent (#492). Inside an action the flush
  //  is held, and goes with the action's patch.
  async handleNegotiation(player: Player): Promise<Negotiation> {
    const before = this.#context.patches.playerState();

    try {
      return await this.#negotiate(player);
    } finally {
      this.#context.patches.playerStateChanged(before);
      this.#context.patches.flush();
    }
  }

  async #negotiate(player: Player): Promise<Negotiation> {
    const negotiation = new Negotiation(
      player,
      this.player(),
      this.#context.rules
    );

    negotiation.proceed(
      new Initiate(player, negotiation, this.#context.rules) as IAction
    );

    // Rounds in a row in which nobody took a step: a chooser that threw, timed out or gave nothing. Asked again, as a
    //  computer player that was slow may answer next time, but not for ever: one that fails every time was asked again
    //  and again, and the worker did nothing else (#470).
    let stalled = 0,
      lastFailure: unknown = null;

    while (!negotiation.terminated()) {
      const steps = negotiation.interactions().length;

      // The steps on offer, worked out once for the first player asked: each call makes new actions.
      let offered: IAction[] | null = negotiation.nextSteps();

      // The player whose steps they are chooses: after the hand-over in a meeting at peace, your OK is for the computer
      //  player, but the next move is yours (#450).
      const players = choosers(negotiation, offered);

      await players.reduce(
        (promise: Promise<void>, player: Player) =>
          promise
            .then(async () => {
              const client = this.#context.clients.getByPlayer(player),
                nextSteps = offered ?? negotiation.nextSteps(),
                resultPromise = Promise.race([
                  client.chooseFromList(
                    new ChoiceMeta(
                      nextSteps,
                      'negotiation.next-step',
                      negotiation
                    )
                  ),
                  client instanceof AIClient
                    ? awaitTimeout(
                        500,
                        new Timeout(
                          `Timeout waiting for ${client.player().id()} (${
                            client.player().civilization().sourceClass().name
                          }) - sent ${nextSteps.length} options`
                        )
                      )
                    : new Promise<void>(() => {}),
                ]);

              offered = null;

              const interaction = await resultPromise;

              if (!interaction) {
                return;
              }

              negotiation.proceed(interaction);

              if (interaction instanceof Resolution) {
                await interaction.proposal().resolve(interaction);
              }
            })
            .catch((reason) => {
              console.error(reason);

              lastFailure = reason;
            }),
        Promise.resolve()
      );

      if (negotiation.terminated()) {
        break;
      }

      stalled = negotiation.interactions().length === steps ? stalled + 1 : 0;

      if (stalled >= maxStalledRounds) {
        // Ended, as though the other player had ended it: the end of talks' rules run as they would then, so a computer
        //  player bluffing about peace still means to drop it (`civ1-diplomacy`'s sham peace). Said, unless a computer
        //  player was only slow to answer, which is not something gone wrong.
        try {
          negotiation.proceed(
            new Terminate(player, negotiation, this.#context.rules) as IAction
          );
        } catch (error) {
          console.error(error);
        }

        if (!(lastFailure instanceof Timeout)) {
          this.#context.transport.send('workerError', {
            message: describeError(lastFailure ?? 'the talks went nowhere'),
          });
        }

        break;
      }
    }

    this.#context.interactions.register(negotiation as IInteraction);

    return negotiation;
  }
}

// The talks' engine listeners: the players met by each of our units' moves, and a Diplomat's Meet with King. The
//  `unit:moved` listener is registered before the patches' (`events/patchEvents.ts`), which flushes.
export const registerTalkEvents = (
  engine: Pick<Engine, 'on' | 'off'>,
  ctx: Pick<ClientContext, 'player'> & {
    talks: Pick<Talks, 'meetNeighboursOf' | 'meetWithKing'>;
    // Whether automation is on, read as each unit moves: it is turned on and off mid-game.
    automation: Pick<Automation, 'enabled'>;
  }
): Disposer => {
  const listeners: [string, (...args: any[]) => void][] = [],
    on = (event: string, listener: (...args: any[]) => void): void => {
      engine.on(event, listener);

      listeners.push([event, listener]);
    };

  on('unit:moved', (unit: Unit) => {
    // Automation's own client does the talking for the moves it makes, as it does for halts.
    if (unit.player() !== ctx.player() || ctx.automation.enabled) {
      return;
    }

    ctx.talks.meetNeighboursOf(unit);
  });

  on('player:meet-with-king', (player: Player, other: Player) => {
    if (player !== ctx.player()) {
      return;
    }

    ctx.talks.meetWithKing(other);
  });

  return (): void =>
    listeners.forEach(([event, listener]) => engine.off(event, listener));
};

export default Talks;
