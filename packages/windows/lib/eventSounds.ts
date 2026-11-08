// The game's moments as Civ1's tunes (#126): the notices the player is shown, the talks and the ending, each as the
//  original's sound driver plays them. Only a mapping from what the page is told to a tune: nothing here works out
//  any rule. The tunes are PlayTune IDs in ASOUND.CVL, so without one, or with the sound off, nothing is heard.
//
// Kept apart from `app/music.ts`, which reads the build, so that it can be tested with a stand-in for the player.

import {
  Civilization,
  Dialogue,
  Interactions,
  Negotiation,
  Player,
} from '@civ-clone/ui-client/types';
import type { BattleSound } from '../../../src/js/Engine/Client/battleEvents';
import { GameOverDetails } from '../../../src/js/Engine/lib/gameOver';
import civilizationAttribute from '../components/lib/civilizationAttribute';
import instanceOf from '@civ-clone/ui-client/lib/instanceOf';

/** A notice as the page receives it (`components/Notifications.ts`), which isn't imported, so this checks on its own. */
export interface Notification {
  key: string;
  data: any;
}

/** The tunes that aren't a civilization's own. */
export const tunes = {
  mainTheme: 3,
  prepareForWar: 33,
  celebration: 34,
  celebrationEnded: 35,
  disaster: 36,
  nuclearAttack: 42,
  buildingComplete: 44,
} as const;

// What a tune should do once it's asked for: a theme plays on until it's faded, a jingle plays once and lets the sound
//  go quiet.
export interface Jukebox {
  play(id: number, level?: number, options?: { once?: boolean }): void;
  stop(): void;
}

/** A civilization's national theme, as `civ1-civilization` gives it, or `null` for one without (a plugin's, the Barbarians). */
export const nationalTheme = (
  civilization: Civilization | null | undefined
): { long: number; short: number } | null => {
  const theme =
    civilization && Array.isArray(civilization.attributes)
      ? civilizationAttribute(civilization, 'nationalTheme')
      : null;

  return theme && Number.isInteger(theme.long) && Number.isInteger(theme.short)
    ? { long: theme.long, short: theme.short }
    : null;
};

/** The long version (the new game, the diplomacy screen), or, for a civilization without one, the main theme. */
export const longTheme = (
  civilization: Civilization | null | undefined
): number => nationalTheme(civilization)?.long ?? tunes.mainTheme;

/** The short version (a city captured, a Wonder, an advance, an audience), or nothing for a civilization without one. */
export const shortTheme = (
  civilization: Civilization | null | undefined
): number | null => nationalTheme(civilization)?.short ?? null;

// Manhattan Project, by anyone: the end of the world drawing nearer, as Civ1 plays it.
const isManhattanProject = (data: any): boolean =>
  data?.build?._ === 'ManhattanProject';

/** The tune for a notice, or `null` for none. `player` is the player it's told to. */
export const notificationTune = (
  { key, data }: Notification,
  player: Player | null
): number | null => {
  switch (key) {
    case 'City.captured-by-us':
    case 'Player.research-complete':
      return shortTheme(player?.civilization);

    case 'City.captured-from-us':
      return shortTheme(data?.capturingPlayer?.civilization);

    case 'City.building-complete.wonder':
      return isManhattanProject(data)
        ? tunes.disaster
        : shortTheme(player?.civilization);

    // The city, sent only when it's been seen, says whose it is.
    case 'Wonder.building-complete.other-player.known':
      return isManhattanProject(data)
        ? tunes.disaster
        : shortTheme(data?.city?.player?.civilization);

    case 'Wonder.building-complete.other-player.unknown':
      return isManhattanProject(data) ? tunes.disaster : null;

    case 'Player.declaration-expired':
    case 'Player.declaration-broken':
      return tunes.prepareForWar;

    case 'City.leader-celebration':
      return tunes.celebration;

    case 'City.leader-celebration-ended':
      return tunes.celebrationEnded;

    case 'City.civil-disorder':
    case 'City.food-storage-exhausted':
      return tunes.disaster;

    case 'City.building-complete.unit':
    case 'City.building-complete.city-improvement':
    case 'City.building-complete.spaceship-part':
      return tunes.buildingComplete;

    case 'Unit.nuclear-attack':
      return tunes.nuclearAttack;
  }

  return null;
};

// Which of several notices shown at once is heard: the gravest, then a civilization's theme, then the everyday.
const priority = (tune: number): number =>
  tune === tunes.nuclearAttack
    ? 6
    : tune === tunes.prepareForWar
    ? 5
    : tune === tunes.disaster
    ? 4
    : tune === tunes.celebration || tune === tunes.celebrationEnded
    ? 2
    : tune === tunes.buildingComplete
    ? 1
    : 3;

/** The one of `tunes` heard when they come together, or `null` for none. */
export const loudest = (tunes: (number | null)[]): number | null =>
  tunes.reduce<number | null>(
    (chosen, tune) =>
      tune !== null && (chosen === null || priority(tune) > priority(chosen))
        ? tune
        : chosen,
    null
  );

/**
 * The battle tunes for each sound the engine gives a unit (`attackSound`), won and lost, as Civ1 plays them. Civ1's
 *  bombing run is one tune, played however the bombing went.
 */
export const battleTunes: {
  readonly [sound: string]: { readonly won: number; readonly lost: number };
} = {
  melee: { won: 38, lost: 39 },
  gunfire: { won: 40, lost: 41 },
  bombing: { won: 43, lost: 43 },
};

/** A battle's tune: the first of its sounds there's a tune for, or `null` for none. */
export const battleTune = ({ sound, won }: BattleSound): number | null => {
  const known = sound.find((word) =>
    Object.prototype.hasOwnProperty.call(battleTunes, word)
  );

  return known === undefined ? null : battleTunes[known][won ? 'won' : 'lost'];
};

/** The ending's tune: celebration for a win, the lament for anything else. */
export const gameOverTune = (
  details: Pick<GameOverDetails, 'winner'>
): number => (details.winner?.you ? tunes.celebration : tunes.celebrationEnded);

const warDialogues = [
  'declare-war.first-contact',
  'declare-war.mobilize',
  'declare-war.provoked',
  'declare-war.rejected',
];

/** Whether `interaction` is a leader saying the talks end in war. */
export const isWarDialogue = (interaction: Interactions | null): boolean =>
  instanceOf(interaction, 'Dialogue') &&
  warDialogues.includes((interaction as Dialogue).key);

/** The other side of `negotiation`, from `us`'s: the one met, whose themes the talks play. */
export const rivalOf = (
  negotiation: Pick<Negotiation, 'players'>,
  us: Pick<Player, 'id'> | null
): Player | null =>
  negotiation.players?.find((player) => player.id !== us?.id) ?? null;

/** Whether the rival asked for the talks: the first step, "an emissary wishes to speak with you", is theirs. */
export const rivalStarted = (
  negotiation: Pick<Negotiation, 'interactions'>,
  us: Pick<Player, 'id'> | null
): boolean => {
  const [first] = negotiation.interactions ?? [];

  return (
    instanceOf(first ?? null, 'Initiate') &&
    (first as { by?: Player }).by?.id !== undefined &&
    (first as { by?: Player }).by?.id !== us?.id
  );
};

export interface EventSoundsOptions {
  jukebox: Jukebox;
  // How long after a reply that doesn't leave the talks they count as over, if no step follows: the rival can end them
  //  without the page being told.
  talksEndAfter?: number;
  // How long notices are gathered for: a turn's arrive one message at a time, so not all within one task.
  batchAfter?: number;
  // How soon a second Prepare for war is let through: war declared in the talks also ends the treaty, and its notice
  //  would play the same tune again.
  warRepeatAfter?: number;
  now?: () => number;
  setTimeout?: (callback: () => void, delay: number) => unknown;
  clearTimeout?: (handle: any) => void;
}

/**
 * Plays the game's moments through `jukebox`. A theme held for a window (the new game's, the diplomacy screen's) is
 *  faded when that window's done; a jingle in the meantime replaces it, as there's one driver, and then plays out.
 */
export class EventSounds {
  #jukebox: Jukebox;
  #player: () => Player | null = () => null;
  // What the theme playing is held for, or `null` once a jingle has replaced it, or after its fade.
  #holding: 'welcome' | 'talks' | null = null;
  // The talks under way: their id, how many of their steps have been heard, and whether the long theme has started.
  #talks: { id: string; heard: number; long: boolean } | null = null;
  #talksEnd: unknown = null;
  #talksEndAfter: number;
  #setTimeout: (callback: () => void, delay: number) => unknown;
  #clearTimeout: (handle: any) => void;
  // Notices added together, heard as one once the batch is in.
  #batch: (number | null)[] | null = null;
  #batchAfter: number;
  #warAt = -Infinity;
  // While the ending's window is open: its tune is heard out, over any notice that comes with it.
  #ended = false;
  #warRepeatAfter: number;
  #now: () => number;

  constructor({
    jukebox,
    talksEndAfter = 3000,
    batchAfter = 100,
    warRepeatAfter = 30000,
    now = () => Date.now(),
    setTimeout = (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout = (handle) => globalThis.clearTimeout(handle),
  }: EventSoundsOptions) {
    this.#jukebox = jukebox;
    this.#talksEndAfter = talksEndAfter;
    this.#batchAfter = batchAfter;
    this.#warRepeatAfter = warRepeatAfter;
    this.#now = now;
    this.#setTimeout = setTimeout;
    this.#clearTimeout = clearTimeout;
  }

  /** The player the game's notices are told to, read as each one is heard. */
  attach(player: () => Player | null): void {
    this.#player = player;
  }

  /** A new game's welcome: the player's long theme, until `welcomeClosed`. */
  newGame(): void {
    this.#hold('welcome', longTheme(this.#player()?.civilization));
  }

  welcomeClosed(): void {
    this.#release('welcome');
  }

  /** A notice opened in a window: heard as it's shown, so a turn's several are heard one at a time. */
  notificationShown(notification: Notification): void {
    this.#jingle(notificationTune(notification, this.#player()));
  }

  /** A notice beside End Turn: those added together (a turn's start) are heard as one, the gravest. */
  noticeAdded(notification: Notification): void {
    const tune = notificationTune(notification, this.#player());

    if (tune === null) {
      return;
    }

    if (this.#batch !== null) {
      this.#batch.push(tune);

      return;
    }

    this.#batch = [tune];
    this.#setTimeout(() => {
      const batch = this.#batch ?? [];

      this.#batch = null;
      this.#jingle(loudest(batch));
    }, this.#batchAfter);
  }

  /** A step of the talks shown to the player. */
  negotiationStep(negotiation: Negotiation): void {
    this.#cancelTalksEnd();

    const us = this.#player(),
      rival = rivalOf(negotiation, us),
      interactions = negotiation.interactions ?? [],
      first = this.#talks?.id !== negotiation.id;

    if (first) {
      this.#talks = { id: negotiation.id, heard: 0, long: false };
    }

    const talks = this.#talks!,
      said = interactions.slice(talks.heard);

    talks.heard = interactions.length;

    // "Prepare for war!": heard over everything else, and the diplomacy screen's theme isn't taken up again after it.
    if (said.some(isWarDialogue)) {
      talks.long = true;
      this.#jingle(tunes.prepareForWar);

      return;
    }

    // An audience the rival asked for: their short theme as their emissary arrives, then their long theme at the
    //  table, from the next step. Played over each other, the short would only be cut off.
    if (first && rivalStarted(negotiation, us)) {
      this.#jingle(shortTheme(rival?.civilization));

      return;
    }

    if (!talks.long) {
      talks.long = true;
      this.#hold('talks', longTheme(rival?.civilization));
    }
  }

  /**
   * Another choice within the talks (the advance to take in an exchange): they go on, however long it takes to choose.
   */
  talksContinued(): void {
    this.#cancelTalksEnd();
  }

  /** The player's reply to a step of the talks: leaving them fades the diplomacy screen's theme at once. */
  negotiationReplied(reply: Interactions | null): void {
    this.#cancelTalksEnd();

    if (instanceOf(reply, 'Terminate')) {
      this.#talksOver();

      return;
    }

    // Unless another step follows: the rival may have ended them.
    this.#talksEnd = this.#setTimeout(() => {
      this.#talksEnd = null;
      this.#talksOver();
    }, this.#talksEndAfter);
  }

  /** A battle the player sees or fights, heard as it's fought. */
  battle(battle: BattleSound): void {
    this.#jingle(battleTune(battle));
  }

  gameOver(details: Pick<GameOverDetails, 'winner'>): void {
    // A notice gathered just before (the city whose loss ends the game) isn't heard over it.
    this.#batch = null;
    this.#ended = false;
    this.#jingle(gameOverTune(details));
    this.#ended = true;
  }

  /** The ending's window is closed: playing on, the game's moments are heard again. */
  gameOverClosed(): void {
    this.#ended = false;
  }

  // Their id is kept: a step of the same talks after all (a reply slower than the timer thought) takes the long theme
  //  up again rather than starting the audience over.
  #talksOver(): void {
    if (this.#talks !== null) {
      this.#talks.long = false;
    }

    this.#release('talks');
  }

  #cancelTalksEnd(): void {
    if (this.#talksEnd !== null) {
      this.#clearTimeout(this.#talksEnd);
      this.#talksEnd = null;
    }
  }

  #hold(holding: 'welcome' | 'talks', id: number): void {
    this.#holding = holding;
    this.#jukebox.play(id);
  }

  // A held theme's window is done: faded, unless a jingle has taken its place since, which plays out.
  #release(holding: 'welcome' | 'talks'): void {
    if (this.#holding !== holding) {
      return;
    }

    this.#holding = null;
    this.#jukebox.stop();
  }

  #jingle(id: number | null): void {
    if (id === null || this.#ended) {
      return;
    }

    if (id === tunes.prepareForWar) {
      const now = this.#now();

      if (now - this.#warAt < this.#warRepeatAfter) {
        return;
      }

      this.#warAt = now;
    }

    this.#holding = null;
    this.#jukebox.play(id, 3, { once: true });
  }
}

export default EventSounds;
