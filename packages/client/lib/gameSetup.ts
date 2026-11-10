// What the game setup (#605) holds and sends, apart from how it is drawn: the world, the seats, and the request that
//  starts the game. Both interfaces draw it: the new interface's form (`GameSetupForm`, #750) and the classic
//  `GameSetupWindow`, which differs only in how it treats a civilization's lone leader (#868).

import {
  WorldSize,
  customSizeProblem,
  defaultWorldSize,
  earthWorldSizes,
  worldSizesFor,
} from './worldSizes';
import AIClients from '@civ-clone/ui-protocol/Requests/AIClients';
import Civilizations, {
  CivilizationOption,
} from '@civ-clone/ui-protocol/Requests/Civilizations';
import Difficulties, {
  DifficultyOption,
} from '@civ-clone/ui-protocol/Requests/Difficulties';
import Options from '@civ-clone/ui-protocol/Requests/Options';
import RuleSets, {
  RuleSetChoice,
  RuleSetNode,
  RuleSetsAnswer,
} from '@civ-clone/ui-protocol/Requests/RuleSets';
import Request from '@civ-clone/core-data-client/Request';
import { TopologyId } from './topologyFor';
import Transport from '../Transport';
import { rememberDifficulty } from './difficulty';
import { t } from 'i18next';
import { unlessRequestFailed } from './unlessRequestFailed';

export type FinishedHandler = () => void | Promise<void>;

/** What the setup opens with: Earth selected, or the Advanced section open, as Customize World. */
export type GameSetupPreset = {
  advanced?: boolean;
  earth?: boolean;
};

export type SeatKind = 'human' | 'computer';

/** A seat as the setup holds it; `random` and the default AI are sent as nothing (#604). */
export type SeatState = {
  kind: SeatKind;
  name: string;
  civilization: string;
  leader: string;
  ai: string;
};

/** What the worker answers before the setup is built. */
export type SetupData = {
  aiClients: string[];
  civilizations: CivilizationOption[];
  difficulties: DifficultyOption[];
  existing: { [key: string]: any };
  /** The rule sets a new game can switch (#158), as they start. None, from a worker that offers none. */
  ruleSets?: RuleSetsAnswer;
};

/** The world's land, as the Advanced section sets it. */
export type LandOptions = {
  landCoverage: string;
  landSize: string;
  maxIterations: string;
};

/** A map the setup offers: one of the grid's sizes, one of Earth's, or the size typed in. */
export type MapChoice = {
  value: string;
  label: string;
  group: 'size' | 'earth' | 'custom';
};

export const RANDOM = 'random';

/** Asks the worker what there is to choose from. */
export const requestSetupData = async (
  transport: Transport
): Promise<SetupData> => {
  const [civilizations, aiClients, difficulties, ruleSets, existing] =
    await Promise.all([
      transport.request(new Civilizations()),
      transport.request(new AIClients()),
      transport.request(new Difficulties()),
      transport.request(new RuleSets()),
      transport.request(
        new Options([
          'width',
          'height',
          'landCoverage',
          'landSize',
          'maxIterations',
        ])
      ),
    ]);

  return { aiClients, civilizations, difficulties, existing, ruleSets };
};

export class GameSetup {
  readonly data: SetupData;

  topologyId: TopologyId = 'square';
  earth: boolean = false;
  size: WorldSize | null = defaultWorldSize;
  width: number = defaultWorldSize.width;
  height: number = defaultWorldSize.height;

  // In player order.
  seats: SeatState[];

  // The rule sets (#158) as the worker last described them, and the choices that make them so, which `start` sends.
  //  What is drawn comes from the worker each time: what switching a set does to what is beneath it is the rules' to
  //  say.
  ruleSets: RuleSetNode[];
  ruleSetChoices: RuleSetChoice[];
  // One change at a time, each made to the choices the one before it left: two sent together would both start from
  //  the same choices, and the second answer would undo the first.
  #ruleSetChange: Promise<void> = Promise.resolve();

  constructor(data: SetupData, preset: GameSetupPreset = {}) {
    this.data = data;

    this.ruleSets = data.ruleSets?.sets ?? [];
    this.ruleSetChoices = data.ruleSets?.choices ?? [];

    if (preset.earth) {
      this.earth = true;
    }

    // Customize World opens on the world last set: one of the sizes, or a custom one.
    const width = Number(data.existing.width),
      height = Number(data.existing.height);

    if (preset.advanced && width > 0 && height > 0) {
      this.size =
        worldSizesFor(this.topologyId).find(
          (size) => size.width === width && size.height === height
        ) ?? null;
      this.width = width;
      this.height = height;
    }

    this.seats = new Array(this.defaultSeatCount())
      .fill(0)
      .map((value: 0, index: number) =>
        this.#newSeat(index === 0 ? 'human' : 'computer')
      );
  }

  #newSeat(kind: SeatKind): SeatState {
    return {
      kind,
      name: '',
      civilization: RANDOM,
      leader: RANDOM,
      ai: this.data.aiClients[0] ?? '',
    };
  }

  defaultSeatCount(): number {
    return Math.min(
      this.size?.players ?? defaultWorldSize.players,
      this.maxSeats()
    );
  }

  /** As many seats as the map has room for, or as there are civilizations to play. */
  maxSeats(): number {
    return Math.min(
      this.size?.maxPlayers ?? this.data.civilizations.length,
      this.data.civilizations.length
    );
  }

  sizes(): WorldSize[] {
    return this.earth ? earthWorldSizes : worldSizesFor(this.topologyId);
  }

  /** The chosen map's value, as `maps()` lists it. */
  map(): string {
    return this.size
      ? `${this.earth ? 'earth' : 'size'}:${this.size.key}`
      : 'custom';
  }

  /** This grid's sizes, Earth's sizes, and the custom size when one is typed. */
  maps(): MapChoice[] {
    const label = (size: WorldSize): string =>
      t(`NewGameWindow.WorldSize.${size.key}`, {
        width: size.width,
        height: size.height,
      });

    return [
      ...worldSizesFor(this.topologyId).map(
        (size): MapChoice => ({
          value: `size:${size.key}`,
          label: label(size),
          group: 'size',
        })
      ),
      ...earthWorldSizes.map(
        (size): MapChoice => ({
          value: `earth:${size.key}`,
          label: t('GameSetup.earth', { size: label(size) }),
          group: 'earth',
        })
      ),
      ...(this.size
        ? []
        : [
            {
              value: 'custom',
              label: t('GameSetup.custom', {
                width: this.width,
                height: this.height,
              }),
              group: 'custom' as const,
            },
          ]),
    ];
  }

  chooseMap(value: string): void {
    const [kind, key] = value.split(':');

    this.earth = kind === 'earth';
    this.size = this.sizes().find((size) => size.key === key) ?? null;

    if (this.size) {
      this.width = this.size.width;
      this.height = this.size.height;
    }

    this.#settle();
  }

  /** The same size on the new grid has its own width and height. */
  chooseGrid(topologyId: TopologyId): void {
    this.topologyId = topologyId;

    if (this.size) {
      this.size =
        worldSizesFor(this.topologyId).find(
          (size) => size.key === this.size!.key
        ) ?? null;
      this.width = this.size?.width ?? this.width;
      this.height = this.size?.height ?? this.height;
    }

    this.#settle();
  }

  /** A size typed in is a custom world, and never Earth. */
  setCustomSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.size = null;
    this.earth = false;

    this.#settle();
  }

  // Earth is square only. A smaller map has room for fewer: computer seats go first, from the end, so the human's
  //  stays.
  #settle(): void {
    if (this.earth) {
      this.topologyId = 'square';
    }

    while (this.seats.length > this.maxSeats()) {
      const last = [...this.seats]
        .reverse()
        .find((seat) => seat.kind === 'computer');

      this.seats.splice(this.seats.indexOf(last ?? this.seats[0]!), 1);
    }
  }

  canAddSeat(): boolean {
    return this.seats.length < this.maxSeats();
  }

  addSeat(): void {
    if (this.canAddSeat()) {
      this.seats.push(this.#newSeat('computer'));
    }
  }

  /** The last seat stays: a game needs one. */
  canRemoveSeat(): boolean {
    return this.seats.length > 1;
  }

  removeSeat(index: number): void {
    if (this.canRemoveSeat()) {
      this.seats.splice(index, 1);
    }
  }

  /** One human player for now (#161): a seat can be made human only while no other one is. */
  canBeHuman(seat: SeatState): boolean {
    return (
      seat.kind === 'human' ||
      !this.seats.some((other) => other !== seat && other.kind === 'human')
    );
  }

  setKind(seat: SeatState, kind: SeatKind): void {
    if (kind === 'human' && !this.canBeHuman(seat)) {
      return;
    }

    seat.kind = kind;
  }

  /** Nobody plays: the game is watched (#607). */
  watched(): boolean {
    return !this.seats.some((seat) => seat.kind === 'human');
  }

  /** The civilizations the other seats have chosen, which this one can't. */
  taken(except: SeatState): Set<string> {
    return new Set(
      this.seats
        .filter((seat) => seat !== except && seat.civilization !== RANDOM)
        .map((seat) => seat.civilization)
    );
  }

  civilization(seat: SeatState): CivilizationOption | null {
    return (
      this.data.civilizations.find(({ name }) => name === seat.civilization) ??
      null
    );
  }

  /** A civilization with one leader is played by that leader; with more, any of them, or one left to chance. */
  setCivilization(seat: SeatState, civilization: string): void {
    seat.civilization = civilization;

    const leaders = this.civilization(seat)?.leaders ?? [];

    seat.leader = leaders.length === 1 ? leaders[0]! : RANDOM;
  }

  /** What's wrong with the size typed in, if anything, for the field it's in. */
  problem(width: string, height: string): ReturnType<typeof customSizeProblem> {
    return this.earth
      ? null
      : customSizeProblem(this.topologyId, width, height);
  }

  /** A chosen leader is sent, but not a civilization's lone one, which the worker would choose anyway. */
  sendsLeader(seat: SeatState): boolean {
    return (
      seat.civilization !== RANDOM &&
      seat.leader !== RANDOM &&
      (this.civilization(seat)?.leaders.length ?? 0) > 1
    );
  }

  /**
   * The seats as the worker takes them: random and the default AI left out, and a leader only as `sendsLeader()`
   *  says.
   */
  seatsPayload(): object[] {
    return this.seats.map((seat) => ({
      kind: seat.kind,
      ...(seat.kind === 'human' && seat.name.trim() !== ''
        ? { name: seat.name.trim() }
        : {}),
      ...(seat.civilization !== RANDOM
        ? { civilization: seat.civilization }
        : {}),
      ...(this.sendsLeader(seat) ? { leader: seat.leader } : {}),
      ...(seat.kind === 'computer' &&
      seat.ai !== '' &&
      seat.ai !== this.data.aiClients[0]
        ? { ai: seat.ai }
        : {}),
    }));
  }

  /**
   * Switches a rule set or a rule on or off (`value` a boolean), or picks the member of a choice (its id), and takes
   *  the sets as the worker says they then are. Not answered, the player has been told, and the sets are as they were.
   */
  changeRuleSet(transport: Transport, change: RuleSetChoice): Promise<void> {
    this.#ruleSetChange = this.#ruleSetChange.then(async (): Promise<void> => {
      try {
        const { sets, choices } = await transport.request(
          new RuleSets({ choices: this.ruleSetChoices, change })
        );

        this.ruleSets = sets;
        this.ruleSetChoices = choices;
      } catch (error) {
        unlessRequestFailed(error);
      }
    });

    return this.#ruleSetChange;
  }

  /**
   * Sends the world options and the seats as one `setOptions`, then `start`. Not answered, the player has been told,
   *  and the main menu is still there, with no game started (#580).
   */
  async start(
    transport: Transport,
    land: LandOptions,
    difficulty: string,
    onFinished?: FinishedHandler
  ): Promise<void> {
    if (difficulty !== '') {
      rememberDifficulty(difficulty);
    }

    // A rule set switched a moment ago is part of what is sent.
    await this.#ruleSetChange;

    try {
      await transport.request(
        new Request('setOptions', {
          topologyId: this.topologyId,
          earth: this.earth,
          width: this.width,
          height: this.height,
          ...land,
          difficulty,
          ruleSets: this.ruleSetChoices,
          seats: this.seatsPayload(),
        })
      );
    } catch (error) {
      unlessRequestFailed(error);

      return;
    }

    if (onFinished) {
      await onFinished();
    }

    transport.send('start', null);
  }
}

export default GameSetup;
