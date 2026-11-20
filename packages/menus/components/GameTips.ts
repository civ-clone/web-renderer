// The game's help as it's played (#1295): a sentence or two as each moment comes, while Options' "Show help" is on,
//  each tip once a game. Every tip has "Don't show help again", which turns the option off; Options turns it back on.
//  Tips wait their turn in the game's queue of notices (`Notifications`), and go from it when the help is turned off.

import {
  GameTip,
  hasNewUnit,
  tipForNotification,
  tipsDue,
} from '../lib/gameTips';
import type { Player, Unit } from '@civ-clone/ui-protocol/types';
import NotificationWindow from '@civ-clone/ui-component-window/NotificationWindow';
import type Notifications from '@civ-clone/ui-hud/components/Notifications';
import cannotHover from '@civ-clone/ui-widgets/lib/cannotHover';
import {
  keyName,
  keyToActionsMap,
} from '@civ-clone/ui-client/lib/unitActionKeys';
import { instance as options } from '@civ-clone/ui-platform/GameOptionsRegistry';
import { s } from '@dom111/element';
import { t } from 'i18next';

const notificationKey = 'GameTip';

// The tips that say how to do something, which differ by device.
const byDevice: GameTip[] = [
  'found-city',
  'city-founded',
  'unit-built',
  'fortify',
];

// The orders whose keys tips give, by the key the game binds to them.
const keyFor = (action: string): string =>
  keyName(
    Object.entries(keyToActionsMap).find(([, actions]) =>
      actions.includes(action)
    )?.[0] ?? ''
  );

/** A tip's words, for the device in hand. */
export const tipText = (tip: GameTip): string =>
  byDevice.includes(tip)
    ? t(`GameTip.${tip}_${cannotHover() ? 'touch' : 'desktop'}`, {
        key: keyFor(tip === 'fortify' ? 'Fortify' : 'FoundCity'),
      })
    : t(`GameTip.${tip}`);

/** Shows a tip, in the queue's container, with "Don't show help again". */
export const tipWindow = (
  tip: GameTip,
  container: HTMLElement
): NotificationWindow => {
  const text = document.createElement('p'),
    stop = s<HTMLInputElement>('<input type="checkbox">'),
    label = s('<label class="game-tip-stop"></label>', stop);

  text.textContent = tipText(tip);
  label.append(` ${t('GameTip.stop')}`);

  const window = new NotificationWindow(
    t('GameTip.title'),
    s(`<div class="game-tip" data-tip="${tip}"></div>`, text, label),
    { modal: true, parent: container }
  );

  window.on('close', () => {
    if (stop.checked) {
      options.set('showHelp', false);
    }
  });

  return window;
};

export class GameTips {
  #notifications: Notifications;
  // Seen with no city, in this page: only then is a city a first.
  #hadNoCity = false;
  // Queued in this page, so a tip isn't queued twice before it's shown.
  #queued = new Set<GameTip>();
  // The player's units' ids as last seen, to tell a new one by.
  #units: Set<string> | null = null;
  // On the screen now, not yet read.
  #reading = new Set<GameTip>();
  #disposeOption: () => void;

  constructor(notifications: Notifications, newGame: boolean) {
    this.#notifications = notifications;

    // Each tip once a game: a new game hears them all again, a game carried on keeps what it's heard.
    if (newGame) {
      options.set('helpSeen', []);
    }

    // Turned off, the tips still waiting go.
    this.#disposeOption = options.onChange((key) => {
      if (key === 'showHelp' && !this.#on()) {
        this.#notifications.discard(
          (notification) => notification.key === notificationKey
        );
        this.#queued.clear();
      }
    });
  }

  #on(): boolean {
    return options.get('showHelp', true) === true;
  }

  #seen(): string[] {
    const seen = options.get('helpSeen', []);

    return Array.isArray(seen) ? seen : [];
  }

  #queue(tip: GameTip): void {
    if (!this.#on() || this.#queued.has(tip) || this.#seen().includes(tip)) {
      return;
    }

    this.#queued.add(tip);

    this.#notifications.receive({
      key: notificationKey,
      data: { tip },
      open: (container) => {
        // Seen once shown, not once queued: a page closed with it waiting shows it next time.
        this.#queued.delete(tip);
        options.set('helpSeen', [...this.#seen(), tip]);

        this.#reading.add(tip);

        const window = tipWindow(tip, container);

        window.on('close', () => this.#reading.delete(tip));

        return window;
      },
    });
  }

  /** Looks at the game as it is now, after each change. */
  update(player: Player, active: Unit | null, turn: number): void {
    if (player.cities.length === 0) {
      this.#hadNoCity = true;
    }

    const newUnit = hasNewUnit(this.#units, player);

    this.#units = new Set(player.units.map(({ id }) => id));

    if (!this.#on()) {
      return;
    }

    if (newUnit) {
      this.#queue('unit-built');
    }

    tipsDue(
      {
        player,
        active,
        turn,
        hadNoCity: this.#hadNoCity,
        shown: this.#seen().filter((tip) => !this.#reading.has(tip as GameTip)),
      },
      [...this.#seen(), ...this.#queued]
    ).forEach((tip) => this.#queue(tip));
  }

  /** Hears the game's notifications, some of which bring a tip. */
  notification(key: string, player: Player): void {
    const tip = tipForNotification(key, player);

    if (tip !== null) {
      this.#queue(tip);
    }
  }

  dispose(): void {
    this.#disposeOption();
  }
}

export default GameTips;

export { tipForNotification };
