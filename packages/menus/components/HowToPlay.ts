// How to play (#1270): what a new player needs for the first turns, and the controls, for the device in hand. A touch
//  screen is told about taps and pressing and holding, with the keyboard's keys tucked away; a mouse and keyboard
//  about clicks, the wheel and the keys. Either can be switched to the other. The keys come from what the game binds
//  (`gameKeys`, `unitActionKeys`), never typed out twice, and what an interface does differently (a right-click, the
//  map's tooltips) from what it says it does. Nothing here is about the rules: what a building does is the
//  Civilopedia's (#1196).

import gameKeys, { helpCommands } from '@civ-clone/ui-client/lib/gameKeys';
import {
  keyName,
  keyToActionsMap,
} from '@civ-clone/ui-client/lib/unitActionKeys';
import Window from '@civ-clone/ui-component-window/Window';
import cannotHover from '@civ-clone/ui-widgets/lib/cannotHover';
import { hasFeature } from '@civ-clone/ui-platform/lib/interfaceMode';
import { mapMenus } from './mapMenus';
import { markHowToPlaySeen } from '../lib/howToPlaySeen';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

export type Device = 'touch' | 'desktop';

/** The device to describe first: a touch screen when the main pointer can't hover, and a mouse otherwise. */
export const deviceNow = (): Device => (cannotHover() ? 'touch' : 'desktop');

// The moving keys, in the order the help says them: up, down, left, right, then the diagonals.
const movingKeys = [
  ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
  ['Home', 'PageUp', 'End', 'PageDown'],
];

// The keys a name of their own reads better as, on a key cap.
const keyCaps: { [key: string]: string } = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
};

const kbd = (key: string): HTMLElement => {
  const element = document.createElement('kbd');

  element.textContent = keyCaps[key] ?? keyName(key);

  return element;
};

const paragraph = (text: string): HTMLParagraphElement => {
  const element = document.createElement('p');

  element.textContent = text;

  return element;
};

const list = (lines: string[]): HTMLUListElement => {
  const element = document.createElement('ul');

  element.append(
    ...lines.map((line) => {
      const item = document.createElement('li');

      item.textContent = line;

      return item;
    })
  );

  return element;
};

const section = (heading: string, ...content: Node[]): HTMLElement =>
  s(
    '<section class="how-to-play-section"></section>',
    (() => {
      const element = document.createElement('h4');

      element.textContent = heading;

      return element;
    })(),
    ...content
  );

// A table of keys and what they do, as a definition list: each command's keys, then its words.
const keyTable = (rows: [string[], string][]): HTMLDListElement => {
  const element = document.createElement('dl');

  element.className = 'how-to-play-keys';

  rows.forEach(([keys, text]) => {
    const term = document.createElement('dt'),
      definition = document.createElement('dd');

    keys.forEach((key, index) => {
      if (index > 0) {
        term.append(' ');
      }

      term.append(kbd(key));
    });

    definition.textContent = text;
    element.append(term, definition);
  });

  return element;
};

/** The game's keys the help shows, as rows of a key table: from `gameKeys`, in `helpCommands`' order. */
export const gameKeyRows = (): [string[], string][] =>
  helpCommands.map((commands): [string[], string] => [
    commands.map((command) => gameKeys[command]),
    t(`HowToPlay.key.${commands[0]}`),
  ]);

/** A unit's order keys, as rows: each key with the orders it gives, by their names on the unit's buttons. */
export const unitKeyRows = (): [string[], string][] =>
  Object.entries(keyToActionsMap).map(([key, actions]): [string[], string] => [
    [key],
    // Once each: two orders can share a name (Pillage, and a Spy's).
    Array.from(
      new Set(
        actions.map((action) =>
          t(`Action.${action}.name`, { defaultValue: action, ns: 'unit' })
        )
      )
    ).join(t('HowToPlay.or')),
  ]);

const keys = (): HTMLElement =>
  s(
    '<div class="how-to-play-keyboard"></div>',
    paragraph(t('HowToPlay.keys.intro')),
    keyTable(
      movingKeys.map(([...keys], index): [string[], string] => [
        keys,
        t(`HowToPlay.keys.move.${index === 0 ? 'straight' : 'diagonal'}`),
      ])
    ),
    paragraph(t('HowToPlay.keys.game')),
    keyTable(gameKeyRows()),
    paragraph(t('HowToPlay.keys.unit')),
    keyTable(unitKeyRows()),
    paragraph(t('HowToPlay.keys.windows'))
  );

// What the pointer does on the map, by device and by what the interface does with a right-click and a hover.
const controls = (device: Device): HTMLElement[] => {
  if (device === 'touch') {
    return [
      list([
        t('HowToPlay.touch.tap-city'),
        t('HowToPlay.touch.tap-units'),
        t('HowToPlay.touch.tap-elsewhere'),
        t('HowToPlay.touch.hold'),
        t('HowToPlay.touch.drag'),
        t('HowToPlay.touch.buttons'),
      ]),
      // A tablet with a keyboard can reach the keys.
      s(
        '<details class="how-to-play-more-keys"></details>',
        (() => {
          const summary = document.createElement('summary');

          summary.textContent = t('HowToPlay.touch.show-keys');

          return summary;
        })(),
        keys()
      ),
    ];
  }

  const rightClick = mapMenus.current().unitMenuOnRightClick;

  return [
    list([
      t('HowToPlay.desktop.click-city'),
      t('HowToPlay.desktop.click-units'),
      t('HowToPlay.desktop.click-elsewhere'),
      t('HowToPlay.desktop.hold', { context: rightClick ? 'right' : '' }),
      t('HowToPlay.desktop.drag'),
      t('HowToPlay.desktop.wheel'),
      t('HowToPlay.desktop.hover', {
        context: hasFeature('squareTooltips') ? 'squares' : '',
      }),
    ]),
    keys(),
  ];
};

const content = (device: Device): HTMLElement[] => [
  section(
    t('HowToPlay.heading.first-turns'),
    paragraph(t('HowToPlay.first.turns')),
    paragraph(t(`HowToPlay.first.move_${device}`)),
    paragraph(t('HowToPlay.first.city')),
    paragraph(t('HowToPlay.first.production')),
    paragraph(t('HowToPlay.first.end-turn')),
    paragraph(t('HowToPlay.first.screen'))
  ),
  section(t('HowToPlay.heading.controls'), ...controls(device)),
  section(
    t('HowToPlay.heading.more'),
    list([
      t('HowToPlay.more.civilopedia'),
      t('HowToPlay.more.reports'),
      t('HowToPlay.more.saves'),
      t('HowToPlay.more.new-game'),
      t('HowToPlay.more.options'),
    ])
  ),
];

// The one open, which the menus reuse rather than piling up another.
let open: HowToPlay | null = null;

export class HowToPlay extends Window {
  #device: Device;
  #media: MediaQueryList | null = window.matchMedia?.('(hover: none)') ?? null;
  // Whether the touch screen's keyboard shortcuts are open.
  #keysOpen = false;
  // Chosen by the player, the device stays as chosen: a tablet docked to a keyboard doesn't switch it back.
  #chosen = false;
  #mediaListener = (): void => {
    if (!this.#chosen) {
      this.show(deviceNow());
    }
  };

  constructor(device: Device = deviceNow()) {
    super(t('HowToPlay.title'), s('<div></div>'), {
      classes: 'how-to-play',
    });

    open = this;
    this.#device = device;
    this.#media?.addEventListener?.('change', this.#mediaListener);

    this.on('close', () => {
      this.#media?.removeEventListener?.('change', this.#mediaListener);

      if (open === this) {
        open = null;
      }
    });

    this.show(device);
  }

  /** The device described now. */
  device(): Device {
    return this.#device;
  }

  /** Describes `device`. */
  show(device: Device): void {
    // The keyboard shortcuts stay open, if they were, and the focus where it was, if it was in here.
    const shownFold = this.element().querySelector('.how-to-play-more-keys');

    // Kept while a view without the fold is shown, for when the touch screen's is shown again.
    if (shownFold !== null) {
      this.#keysOpen = shownFold.hasAttribute('open');
    }

    const focusedDevice =
      (document.activeElement as HTMLElement | null)?.closest?.(
        '.how-to-play-device-option'
      ) ?? null;

    this.#device = device;

    const switcher = s(
      `<div class="how-to-play-device" role="group" aria-label="${t(
        'HowToPlay.device.label'
      )}"></div>`,
      ...(['touch', 'desktop'] as Device[]).map((option) => {
        const button = h(
          s<HTMLButtonElement>(
            '<button type="button" class="btn-bare how-to-play-device-option"></button>'
          ),
          {
            click: () => {
              this.#chosen = true;
              this.show(option);
            },
          }
        );

        button.dataset.device = option;
        button.textContent = t(`HowToPlay.device.${option}`);
        button.setAttribute('aria-pressed', String(option === device));

        return button;
      })
    );

    this.update(
      s(
        `<div class="how-to-play-body" data-device="${device}"></div>`,
        switcher,
        ...content(device)
      )
    );

    const fold = this.element().querySelector<HTMLDetailsElement>(
      '.how-to-play-more-keys'
    );

    fold?.toggleAttribute('open', this.#keysOpen);

    if (focusedDevice !== null) {
      this.element()
        .querySelector<HTMLButtonElement>(
          `.how-to-play-device-option[data-device="${device}"]`
        )
        ?.focus();
    }
  }

  /** Opens How to play, or brings the one open to the front. */
  static open(): HowToPlay {
    // Opened by any way, the title screen's first-visit line has been answered.
    markHowToPlaySeen();
    document
      .querySelectorAll('.how-to-play-prompt')
      .forEach((prompt) => prompt.remove());

    if (open !== null && open.element().isConnected) {
      open.element().focus();

      return open;
    }

    return new HowToPlay();
  }
}

export default HowToPlay;
