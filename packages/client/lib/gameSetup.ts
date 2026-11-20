// What the game setup (#605) holds and sends, apart from how it is drawn: the world, the seats, and the request that
//  starts the game. Both interfaces draw it: the new interface's form (`GameSetupForm`, #750) and the classic
//  `GameSetupWindow`, which differs only in how it treats a civilization's lone leader (#868).

import prepareStart from './startPreparation';
import {
  WorldSize,
  customSizeProblem,
  defaultWorldSize,
  earthWorldSizes,
  ruleWorldSizes,
  withinPlayers,
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
  RuleSetProblem,
  RuleSetsAnswer,
} from '@civ-clone/ui-protocol/Requests/RuleSets';
import Request from '@civ-clone/core-data-client/Request';
import {
  CustomWorldSizeOption,
  WorldSizesAnswer,
} from '@civ-clone/ui-protocol/Requests/WorldSizes';
import { TopologyId } from './topologyFor';
import Transport from '../Transport';
import { rememberNewGame } from './lastNewGame';
import { rememberDifficulty } from './difficulty';
import { t } from 'i18next';
import { unlessRequestFailed } from './unlessRequestFailed';

export type FinishedHandler = () => void | Promise<void>;

/**
 * What the setup opens with: Earth selected, or the Advanced section open, as Customize World, and the game chosen
 *  (#668), by its set's id.
 */
export type GameSetupPreset = {
  advanced?: boolean;
  earth?: boolean;
  pluginSet?: string;
  /**
   * The seats a setup for another game, or the same game's other rules, had (#668, #1248): who plays each, a person's
   *  name, and each one's civilization, leader and AI, kept where this game has them, and otherwise left to chance and
   *  the default.
   */
  seats?: (Pick<SeatState, 'kind' | 'name'> &
    Partial<Pick<SeatState, 'civilization' | 'leader' | 'ai'>>)[];
  /**
   * The grid the player chose (#1248), kept where this game can be on it: by a game with no grid of its own, or by one
   *  with a grid of its own (Civ2's, #1249) only from a setup for the same game (`game`), its other rules.
   */
  topologyId?: TopologyId;
  /** The game the grid was chosen for (#1249), by its set's game (`gameOf`). */
  game?: string;
  /** The map it had (`map()`), kept where this game offers it, and a custom size's width and height. */
  map?: string;
  width?: number;
  height?: number;
  /** The level chosen (#1248), kept where this game has it. */
  difficulty?: string;
  /** The Advanced section's land. */
  land?: LandOptions;
  /**
   * The rule sets it had switched (#1248), sent with the first question about this game's: those it knows are made,
   *  and the rest are kept for a setup after this one, so a change switched off under Enhanced is still off after a
   *  look at Original.
   */
  ruleSetChoices?: RuleSetChoice[];
};

/** Which game the setup is for (#668), when there is more than one to choose from. */
export type GameChoice = {
  /** The set chosen, which the worker has loaded, or will load first. */
  id: string;
  /**
   * Every game the setup offers, the default first, each by the set its card plays: a game with original rules beside
   *  its own (`originals`) by its own, its enhanced rules (#1248).
   */
  games: string[];
  /** The original rules of each game in `games` that has them, by the game's set: Civ1's `civ1` for `civ1-enhanced`. */
  originals: { [set: string]: string };
  /** The grid its games start on, its own art's (Civ2's), or null for any. */
  grid: TopologyId | null;
  /**
   * The grids its games can be played on, those its art is for (#1249), its own first, or null for any. Left out, the
   *  game is played only on `grid`.
   */
  grids?: TopologyId[] | null;
};

/** The game the set `id` is played as (#1248): itself, or the game whose original rules it is. */
export const gameOf = (
  { originals }: Pick<GameChoice, 'originals'>,
  id: string
): string => Object.keys(originals).find((set) => originals[set] === id) ?? id;

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
  /** The game it is (#668), and the others there are, when the page offers more than one. */
  game?: GameChoice;
  /**
   * The world sizes the game's rules offer (#1175), and what a size typed in may be. Rules that offer none, or a page
   *  that didn't ask, leave the setup offering its own.
   */
  worldSizes?: WorldSizesAnswer;
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
  transport: Transport,
  // The rule sets switched in a setup before this one (#1248): those the rules know are made.
  ruleSetChoices: RuleSetChoice[] = []
): Promise<SetupData> => {
  const [civilizations, aiClients, difficulties, ruleSets, existing] =
    await Promise.all([
      transport.request(new Civilizations()),
      transport.request(new AIClients()),
      transport.request(new Difficulties()),
      transport.request(
        new RuleSets(
          ruleSetChoices.length === 0 ? null : { choices: ruleSetChoices }
        )
      ),
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
  // What is wrong with them, as the worker found it (#954): a game doesn't start while one that blocks stands.
  ruleSetProblems: RuleSetProblem[];
  // One change at a time, each made to the choices the one before it left: two sent together would both start from
  //  the same choices, and the second answer would undo the first.
  //  Never rejected, so that one change that fails doesn't stop every one after it.
  #ruleSetChange: Promise<void> = Promise.resolve();
  // A change failed for a reason other than going unanswered (the player has been told of that, #470) since Start was
  //  pressed: the game doesn't start on choices that may not be the player's.
  #changeFailed: boolean = false;
  /**
   * A switch to another game, or this game's other rules, is under way (#1248): the setup is held, and nothing in it is
   *  changed, as the worker it would reach is on its way to another game.
   */
  switching: boolean = false;
  // The grid is the player's choice (#1249): picked here, or carried from a setup where it was, and so carried on.
  #gridChosen: boolean = false;
  /** The setup's window has closed (#1248): a switch on its way opens nothing. */
  closed: boolean = false;
  // From Start until the game goes ahead, or doesn't (#954): Start is held meanwhile.
  #starting: boolean = false;
  // The setup closed while a start waited on a change: nothing is sent.
  #cancelled: boolean = false;

  constructor(data: SetupData, preset: GameSetupPreset = {}) {
    this.data = data;

    this.ruleSets = data.ruleSets?.sets ?? [];
    this.ruleSetChoices = data.ruleSets?.choices ?? [];
    this.ruleSetProblems = data.ruleSets?.problems ?? [];

    // A game with a grid of its own (Civ2's) starts on it, with that grid's size of the same name, or the rules' own
    //  size of that name (#1175), and on Earth only when its rules have an Earth of their own (#1176): the page's Earth
    //  maps are square. It may be played on the other grids its art is for (#1249).
    const fixedGrid = this.fixedGrid(),
      startGrid = this.defaultGrid();

    if (startGrid !== null) {
      const sizes = this.sizesOn(startGrid),
        size =
          sizes.find(({ key }) => key === this.size?.key) ??
          sizes.find(({ key }) => key === defaultWorldSize.key) ??
          sizes[0] ??
          null;

      this.topologyId = startGrid;
      this.size = size;
      this.width = size?.width ?? this.width;
      this.height = size?.height ?? this.height;
    }

    if (preset.earth && this.earthSizes().length > 0) {
      const sizes = this.earthSizes(),
        // The Earth a setup for another game had (#1248), by its width and height: the size of this game's Earth
        //  nearest it in area, as the two games' Earths are sized differently.
        area = (preset.width ?? 0) * (preset.height ?? 0),
        nearest =
          area > 0
            ? [...sizes].sort(
                (a, b) =>
                  Math.abs(a.width * a.height - area) -
                  Math.abs(b.width * b.height - area)
              )[0]
            : undefined;

      this.earth = true;
      this.size =
        nearest ??
        sizes.find(({ key }) => key === this.size?.key) ??
        sizes[0] ??
        null;
      this.width = this.size?.width ?? this.width;
      this.height = this.size?.height ?? this.height;
      this.topologyId = this.earthGrid();
    }

    // Customize World opens on the world last set: one of the sizes, or a custom one. On a grid of the game's own, only
    //  one of that grid's sizes: a size set before is another grid's.
    const width = Number(data.existing.width),
      height = Number(data.existing.height),
      existingSize =
        this.sizesOn(this.topologyId).find(
          (size) => size.width === width && size.height === height
        ) ?? null;

    if (
      preset.advanced &&
      width > 0 &&
      height > 0 &&
      (!this.hasRuleSizesOn(this.topologyId) || existingSize !== null)
    ) {
      this.size = existingSize;
      this.width = width;
      this.height = height;
    }

    // A setup for another game, or the same game's other rules (#1248), keeps the grid the player chose (none is
    //  carried from a game with a grid of its own), unless this game has a grid of its own or is on Earth, whose grid
    //  is Earth's; the same size by name on it.
    if (
      preset.topologyId !== undefined &&
      fixedGrid === null &&
      this.allowsGrid(preset.topologyId) &&
      (this.defaultGrid() === null || preset.game === this.gameKey()) &&
      !this.earth
    ) {
      this.#gridChosen = true;
      this.topologyId = preset.topologyId;
      this.size =
        this.sizesOn(this.topologyId).find(
          (size) => size.key === this.size?.key
        ) ?? this.size;
      this.width = this.size?.width ?? this.width;
      this.height = this.size?.height ?? this.height;
    }

    // And the map it had, where this game offers it: a size typed in only where this game has no grid of its own, as
    //  Customize World's is; a size, or Earth's, by name. An Earth size this game hasn't is the size of its own Earth
    //  nearest it in area (above), or a map of the sizes it has when it has no Earth.
    if (preset.map === 'custom') {
      if (
        !this.hasRuleSizesOn(this.topologyId) &&
        preset.width &&
        preset.height
      ) {
        this.size = null;
        this.earth = false;
        this.width = preset.width;
        this.height = preset.height;
      }
    } else if (
      preset.map !== undefined &&
      this.maps().some(({ value }) => value === preset.map)
    ) {
      const [kind, key] = preset.map.split(':');

      this.earth = kind === 'earth';
      this.size = this.sizes().find((size) => size.key === key) ?? this.size;
      this.width = this.size?.width ?? this.width;
      this.height = this.size?.height ?? this.height;

      if (this.earth) {
        this.topologyId = this.earthGrid();
      }
    }

    this.seats = new Array(this.defaultSeatCount())
      .fill(0)
      .map((value: 0, index: number) =>
        this.#newSeat(index === 0 ? 'human' : 'computer')
      );

    // Another game's seats, kept as far as this one has room: who plays each, and the names typed. Where there's no
    //  room for them all, the human's is kept, in place of the last that fits.
    const carried = preset.seats ?? [],
      room = this.maxSeats(),
      human = carried.findIndex(({ kind }) => kind === 'human'),
      kept =
        human >= room && room > 0
          ? [...carried.slice(0, room - 1), carried[human]!]
          : carried.slice(0, room);

    if (kept.length > 0) {
      this.seats = kept.map(({ kind, name, civilization, leader, ai }) => {
        const seat = this.#newSeat(kind),
          found = data.civilizations.find(
            (option) => option.name === civilization
          );

        return {
          ...seat,
          name,
          // A civilization this game has, and its leader where it has that one too.
          civilization: found?.name ?? RANDOM,
          leader:
            found !== undefined && found.leaders.includes(leader ?? '')
              ? leader!
              : RANDOM,
          ai: ai !== undefined && data.aiClients.includes(ai) ? ai : seat.ai,
        };
      });
    }

    this.#fillSeats();
  }

  /**
   * Once every rule set switched so far has been answered (#1248): what `carried` keeps is then what the player has
   *  switched, and not the answer before the last change. Never rejects.
   */
  async settled(): Promise<void> {
    let pending: Promise<void>;

    do {
      pending = this.#ruleSetChange;

      await pending;
    } while (pending !== this.#ruleSetChange);
  }

  /**
   * What a setup for another game, or the same game's other rules, keeps of this one (#1248), beside `preset`, the
   *  preset this one was opened with: Earth, the grid, the map, the seats as they are, and the rule sets switched,
   *  with those switched in a setup before this one that this game doesn't know.
   */
  carried(
    preset: GameSetupPreset = {}
  ): Pick<
    GameSetupPreset,
    | 'earth'
    | 'seats'
    | 'topologyId'
    | 'game'
    | 'map'
    | 'width'
    | 'height'
    | 'ruleSetChoices'
  > {
    const known = new Set<string>(),
      collect = (nodes: RuleSetNode[]): void =>
        nodes.forEach(({ id, members }) => {
          known.add(id);
          collect(members);
        });

    collect(this.ruleSets);

    return {
      earth: this.earth,
      seats: this.seats.map(({ kind, name, civilization, leader, ai }) => ({
        kind,
        name,
        civilization,
        leader,
        ai,
      })),
      // Only a grid the player chose: one of the game's own (Civ2's) isn't the player's to carry to another game, nor is
      //  the one it starts on, unless the player picked it (#1249).
      ...(this.fixedGrid() === null &&
      (this.defaultGrid() === null || this.#gridChosen)
        ? { topologyId: this.topologyId, game: this.gameKey() }
        : {}),
      // Nor a size typed in on the rules' own grid: its shape is that grid's (#1248).
      ...(this.hasRuleSizesOn(this.topologyId) && this.size === null
        ? {}
        : { map: this.map(), width: this.width, height: this.height }),
      ruleSetChoices: [
        ...(preset.ruleSetChoices ?? []).filter(({ id }) => !known.has(id)),
        ...this.ruleSetChoices,
      ],
    };
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
      this.size?.players ??
        this.data.worldSizes?.custom?.players ??
        defaultWorldSize.players,
      this.maxSeats()
    );
  }

  /**
   * As many seats as the map has room for, or as there are civilizations to play. A size typed in has room for as many
   *  as the rules say (#1175), when they say.
   */
  maxSeats(): number {
    return Math.min(
      this.size?.maxPlayers ??
        this.data.worldSizes?.custom?.maxPlayers ??
        this.data.civilizations.length,
      this.data.civilizations.length
    );
  }

  /** The game the setup is for, by its set's game (`gameOf`): its enhanced rules' set, or `''` for the only one. */
  gameKey(): string {
    const game = this.data.game;

    return game === undefined ? '' : gameOf(game, game.id);
  }

  /** The grid the rules' own sizes are on (#1175, Civ2's isometric grid), or null for rules with none (Civ1's). */
  rulesGrid(): TopologyId | null {
    return ruleWorldSizes(this.data.worldSizes) === null
      ? null
      : (this.data.worldSizes!.sizes[0]!.topologyId as TopologyId);
  }

  /** Whether `topologyId` is the grid the rules' own sizes are on, which a world on it is one of. */
  hasRuleSizesOn(topologyId: TopologyId): boolean {
    return this.rulesGrid() === topologyId;
  }

  /**
   * The grids the game can be played on (#1249): those its art is for (Civ2's: its own isometric, then the pixel art's
   *  square and hex), or, for a game drawn with whatever the player picks, null for any. An older answer, with only the
   *  grid it starts on, is played there alone.
   */
  grids(): TopologyId[] | null {
    const game = this.data.game;

    if (game === undefined) {
      return null;
    }

    return game.grids !== undefined
      ? game.grids
      : game.grid === null
      ? null
      : [game.grid];
  }

  /** Whether the game can be played on `topologyId`'s grid. */
  allowsGrid(topologyId: TopologyId): boolean {
    const grids = this.grids();

    return grids === null || grids.includes(topologyId);
  }

  /** Of `drawable` (the grids a map can be drawn on), those the game can be played on. */
  gridChoices(drawable: TopologyId[]): TopologyId[] {
    return drawable.filter((grid) => this.allowsGrid(grid));
  }

  /** The grid the game starts on: its art's own (Civ2's), or its rules' sizes' (#1175), or null for the player's pick. */
  defaultGrid(): TopologyId | null {
    return this.data.game?.grid ?? this.rulesGrid();
  }

  /** The only grid the game can be on, when its art is for one alone, or null when the player picks among them. */
  fixedGrid(): TopologyId | null {
    const grids = this.grids();

    if (grids !== null) {
      return grids.length === 1 ? grids[0]! : null;
    }

    // Rules with sizes of their own, and no art of their own to say which grids: on their sizes' grid.
    return this.data.game === undefined ? this.rulesGrid() : null;
  }

  /** The grid Earth is on: the rules' own Earth's (Civ2's), or the page's square Earth. */
  earthGrid(): TopologyId {
    return this.rulesGrid() ?? 'square';
  }

  /**
   * The sizes on `topologyId`'s grid: the rules' own (#1175), on their own grid; on any other, the setup's own for that
   *  grid (Civilization's, #1249), with as many civilizations as the rules have room for, where they say.
   */
  sizesOn(topologyId: TopologyId): WorldSize[] {
    const rules = ruleWorldSizes(this.data.worldSizes);

    if (rules === null) {
      return worldSizesFor(topologyId);
    }

    if (this.hasRuleSizesOn(topologyId)) {
      return rules;
    }

    return withinPlayers(
      worldSizesFor(topologyId),
      Math.min(...rules.map(({ minPlayers }) => minPlayers)),
      Math.max(...rules.map(({ maxPlayers }) => maxPlayers))
    );
  }

  /** What a size typed in may be on the grid chosen: the rules' own limits on their own grid, or none to say. */
  customLimits(): CustomWorldSizeOption | null {
    return this.hasRuleSizesOn(this.topologyId) || this.rulesGrid() === null
      ? this.data.worldSizes?.custom ?? null
      : null;
  }

  /**
   * The sizes there is an Earth map for: the rules' own that say so (Civ2's, #1176), or, from rules with no sizes of
   *  their own, the page's square Earth, unless the game has a grid of its own.
   */
  earthSizes(): WorldSize[] {
    const sizes = ruleWorldSizes(this.data.worldSizes);

    if (sizes !== null) {
      return sizes.filter(({ earth }) => earth);
    }

    return this.defaultGrid() === null ? earthWorldSizes : [];
  }

  sizes(): WorldSize[] {
    return this.earth ? this.earthSizes() : this.sizesOn(this.topologyId);
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
      ...this.sizesOn(this.topologyId).map(
        (size): MapChoice => ({
          value: `size:${size.key}`,
          label: label(size),
          group: 'size',
        })
      ),
      ...this.earthSizes().map(
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

    this.earth = kind === 'earth' && this.earthSizes().length > 0;
    this.size = this.sizes().find((size) => size.key === key) ?? null;

    if (this.size) {
      this.width = this.size.width;
      this.height = this.size.height;
    }

    this.#settle();
  }

  /** The same size on the new grid has its own width and height. */
  chooseGrid(topologyId: TopologyId): void {
    this.#gridChosen = true;

    this.topologyId =
      this.fixedGrid() ??
      (this.allowsGrid(topologyId) ? topologyId : this.topologyId);

    if (this.size) {
      this.size =
        this.sizesOn(this.topologyId).find(
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

  // Earth is on the game's own grid (Civ2's), or else square. A smaller map has room for fewer: computer seats go first,
  //  from the end, so the human's stays.
  #settle(): void {
    if (this.earth) {
      this.topologyId = this.earthGrid();
    }

    while (this.seats.length > this.maxSeats()) {
      const last = [...this.seats]
        .reverse()
        .find((seat) => seat.kind === 'computer');

      this.seats.splice(this.seats.indexOf(last ?? this.seats[0]!), 1);
    }

    this.#fillSeats();
  }

  canAddSeat(): boolean {
    return this.seats.length < this.maxSeats();
  }

  addSeat(): void {
    if (this.canAddSeat()) {
      this.seats.push(this.#newSeat('computer'));
    }
  }

  /**
   * The fewest seats a game has: as many civilizations as the rules' sizes need at least (Civ2's three, #1175), where
   *  they say, and there are that many to play, or else one.
   */
  minSeats(): number {
    const ruleMinimum =
      ruleWorldSizes(this.data.worldSizes) === null
        ? null
        : this.size?.minPlayers ??
          this.data.worldSizes?.custom?.minPlayers ??
          null;

    return Math.max(
      1,
      Math.min(ruleMinimum ?? 1, this.data.civilizations.length)
    );
  }

  // Computer seats added at the end, up to the fewest the game has, as far as there's room.
  #fillSeats(): void {
    while (
      this.seats.length < this.minSeats() &&
      this.seats.length < this.maxSeats()
    ) {
      this.seats.push(this.#newSeat('computer'));
    }
  }

  /** The fewest seats stay: a game needs one, and the rules may need more. */
  canRemoveSeat(): boolean {
    return this.seats.length > this.minSeats();
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
      : customSizeProblem(this.topologyId, width, height, this.customLimits());
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
    const made = this.#ruleSetChange.then(async (): Promise<void> => {
      try {
        const { sets, choices, problems } = await transport.request(
          new RuleSets({ choices: this.ruleSetChoices, change })
        );

        this.ruleSets = sets;
        this.ruleSetChoices = choices;
        this.ruleSetProblems = problems ?? [];
      } catch (error) {
        unlessRequestFailed(error);
      }
    });

    // The caller hears of anything other than a request not answered, as the surprise it is (#580).
    this.#ruleSetChange = made.catch((): void => {
      this.#changeFailed = true;
    });

    return made;
  }

  /**
   * The setup was closed: a start waiting on a rule set switched a moment ago sends nothing. One that has gone ahead
   *  is not stopped.
   */
  cancelStart(): void {
    this.#cancelled = true;
  }

  /** Whether Start has been pressed, and the game is going ahead or waiting on a rule set switched a moment ago. */
  starting(): boolean {
    return this.#starting;
  }

  /** Whether the rule sets, as the worker last described them, have a problem that keeps a game from starting (#954). */
  ruleSetsBlockStart(): boolean {
    return this.ruleSetProblems.some(({ blocking }) => blocking);
  }

  /**
   * Sends the world options and the seats as one `setOptions`, then `start`. Not answered, the player has been told,
   *  and the main menu is still there, with no game started (#580).
   *
   * Every rule set switched a moment ago is waited for, as it is part of what is sent (#954), and nothing is sent, and
   *  this resolves `false`, if one of them failed for a reason other than going unanswered, if they left the rule sets
   *  with a problem that blocks, or if the setup was closed meanwhile (`cancelStart`): for the setup to stay open and
   *  show why, or to go. Otherwise `goingAhead` is called before anything is sent, and this resolves `true`.
   */
  async start(
    transport: Transport,
    land: LandOptions,
    difficulty: string,
    onFinished?: FinishedHandler,
    goingAhead: () => void = () => {}
  ): Promise<boolean> {
    this.#starting = true;
    this.#cancelled = false;
    this.#changeFailed = false;

    // Until the changes are still: one made while waiting is waited for too.
    let pending: Promise<void>;

    do {
      pending = this.#ruleSetChange;

      await pending;
    } while (pending !== this.#ruleSetChange);

    if (this.#changeFailed || this.#cancelled || this.ruleSetsBlockStart()) {
      this.#starting = false;

      return false;
    }

    // The art its map is drawn with, which may have to be fetched (#1063): without it, the setup stays open; closed
    //  while it was fetched, nothing starts.
    if (!(await prepareStart(this.topologyId)) || this.#cancelled) {
      this.#starting = false;

      return false;
    }

    goingAhead();

    if (difficulty !== '') {
      rememberDifficulty(difficulty);
    }

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

      return true;
    }

    // What New Game starts this game with next time (#1247): a size it offers, on its grid, not Earth or a size typed.
    if (!this.earth && this.size !== null) {
      rememberNewGame(
        this.data.game === undefined
          ? ''
          : gameOf(this.data.game, this.data.game.id),
        {
          topologyId: this.topologyId,
          size: this.size.key,
          players: this.seats.length,
        }
      );
    }

    if (onFinished) {
      await onFinished();
    }

    transport.send('start', null);

    return true;
  }
}

export default GameSetup;
