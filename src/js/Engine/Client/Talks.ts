// Talks with other players (#449), moved out of `DataTransferClient`: the players our units have moved next to, the
//  talks a Diplomat's Meet with King starts, and each negotiation, a step at a time, each step chosen by the player
//  whose step it is.
//
// The talks are one promise chain. The action that started them waits for it and then offers talks with the players
//  met on the way, inside the client's flush hold, so a talk's prompt goes out before the patch of the move that
//  started it. The hand-over adds the talks with anyone met by a GoTo carried on at the start of the turn.

import { ChoiceMeta } from '@civ-clone/core-client/ChoiceMeta';
import AIClient from '@civ-clone/core-ai-client/AIClient';
import { ClientRegistry } from '@civ-clone/core-client/ClientRegistry';
import Engine from '@civ-clone/core-engine/Engine';
import { IAction } from '@civ-clone/core-diplomacy/Negotiation/Action';
import { IInteraction } from '@civ-clone/core-diplomacy/Interaction';
import Initiate from '@civ-clone/core-diplomacy/Negotiation/Initiate';
import { InteractionRegistry } from '@civ-clone/core-diplomacy/InteractionRegistry';
import Negotiation from '@civ-clone/core-diplomacy/Negotiation';
import Player from '@civ-clone/core-player/Player';
import Resolution from '@civ-clone/core-diplomacy/Proposal/Resolution';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';
import { Turn } from '@civ-clone/core-turn-based-game/Turn';
import Unit from '@civ-clone/core-unit/Unit';
import { UnitRegistry } from '@civ-clone/core-unit/UnitRegistry';
import { choosers } from '@civ-clone/simple-ai-client/lib/Diplomacy/negotiate';
import mayNegotiate from '@civ-clone/library-diplomacy/lib/mayNegotiate';
import Timeout from '../Error/Timeout';
import { awaitTimeout } from './refs';

export type TalksContext = {
  player(): Player;
  // Whose client chooses each step: ours, or a computer player's.
  clients: Pick<ClientRegistry, 'getByPlayer'>;
  interactions: InteractionRegistry;
  rules: RuleRegistry;
  turn: Turn;
  // The units next to one of ours that has moved.
  units: Pick<UnitRegistry, 'getByTile'>;
};

export class Talks {
  #context: TalksContext;
  // The other players our units have moved next to since talks were last offered (#357): by hand, on a GoTo, or on a
  //  GoTo carried on at the start of the turn.
  #metOnTheWay: Set<Player> = new Set();
  // Talks a Diplomat's Meet with King started (#58), which the action that started them waits for, as it waits for
  //  talks with units met on the way (`talkToPlayersMet`).
  #talks: Promise<void> = Promise.resolve();

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

  meetWithKing(other: Player): void {
    this.#talks = this.#talks
      .then(() => this.handleNegotiation(other))
      .then(() => {});
  }

  handOver(): void {
    // Anyone met by a GoTo carried on at the start of the turn.
    this.#talks = this.#talks.then(() => this.talkToPlayersMet());
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

  async handleNegotiation(player: Player): Promise<Negotiation> {
    const negotiation = new Negotiation(
      player,
      this.player(),
      this.#context.rules
    );

    negotiation.proceed(
      new Initiate(player, negotiation, this.#context.rules) as IAction
    );

    while (!negotiation.terminated()) {
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
            .catch((reason) => console.error(reason)),
        Promise.resolve()
      );

      if (negotiation.terminated()) {
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
  talks: Talks,
  // Whether automation is on, read as each unit moves: it is turned on and off mid-game.
  automation: { readonly enabled: boolean }
): (() => void) => {
  const listeners: [string, (...args: any[]) => void][] = [],
    on = (event: string, listener: (...args: any[]) => void): void => {
      engine.on(event, listener);

      listeners.push([event, listener]);
    };

  on('unit:moved', (unit: Unit) => {
    // Automation's own client does the talking for the moves it makes, as it does for halts.
    if (unit.player() !== talks.player() || automation.enabled) {
      return;
    }

    talks.meetNeighboursOf(unit);
  });

  on('player:meet-with-king', (player: Player, other: Player) => {
    if (player !== talks.player()) {
      return;
    }

    talks.meetWithKing(other);
  });

  return (): void =>
    listeners.forEach(([event, listener]) => engine.off(event, listener));
};

export default Talks;
