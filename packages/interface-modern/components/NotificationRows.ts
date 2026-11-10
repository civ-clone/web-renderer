import { City, Player, PlayerAction } from '@civ-clone/ui-protocol/types';
import { Element, s } from '@dom111/element';
import { noticeText } from '@civ-clone/ui-hud/components/Actions/Notice';
import { Notice as NoticeData } from '@civ-clone/ui-hud/components/Notices';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import { actionKey } from '@civ-clone/ui-client/lib/nextTurnQueue';
import button from '@civ-clone/ui-component-button/button';
import { createAction } from '@civ-clone/ui-hud/components/Actions';
import { glyph } from '@civ-clone/ui-platform/lib/glyphs';
import { setNoticeCategory } from './lib/noticeCategory';
import { t } from 'i18next';

// The notification rows (#416), above the Next Turn button under the new interface (#735): one row for each notice or
//  city in disorder, with a swatch in its tint, what it is, and a way to dismiss it for the turn (the glyph,
//  right-click, or Delete). Notices of one kind share a row with a count. Five rows at most, the rest behind a "+N
//  more" row. A row is opened as its orb is: the same `Action`, so the same window. Rows are kept across renders, so a
//  new one slides in and the others stay put.

export type NotificationRowsDeps = {
  portal: Portal;
  transport: Transport;
  // For the turn: a notice is dismissed for good, as opening it does; a city in disorder until the next turn.
  dismiss: (action: PlayerAction) => void;
};

type Group = {
  key: string;
  kind: string;
  actions: PlayerAction[];
};

// Five rows, then the rest behind the "+N more" row.
const shown = 5;

// A row going, dismissed or no longer wanted, fades out where the theme moves it (#753), taking no input meanwhile, and
//  leaves the page when it has. With no motion (the Civ1 set, reduced motion), it goes at once.
const leavingClass = 'ui-notification-leaving';

const leave = (row: HTMLElement): void => {
  row.classList.add(leavingClass);
  row.inert = true;

  const style =
      typeof getComputedStyle === 'function' ? getComputedStyle(row) : null,
    moving =
      !!style?.animationName &&
      style.animationName !== 'none' &&
      parseFloat(style.animationDuration || '0') > 0;

  if (!moving) {
    row.remove();

    return;
  }

  row.addEventListener('animationend', () => row.remove(), { once: true });
  // In a tab that's hidden the animation may never end.
  setTimeout(() => row.remove(), 1000);
};

export class NotificationRows extends Element {
  #deps: NotificationRowsDeps;
  #expanded = false;
  #groups: Group[] = [];
  #player: Player | null = null;
  // By group, kept across renders.
  #rows = new Map<string, HTMLElement>();
  #more: HTMLButtonElement | null = null;

  constructor(element: HTMLElement, deps: NotificationRowsDeps) {
    super(element);

    this.#deps = deps;
  }

  /** The rows for `entries`, the notices and cities in disorder still to show, oldest first. */
  build(entries: PlayerAction[], player: Player): void {
    const groups = new Map<string, Group>();

    entries.forEach((action) => {
      const key =
        action._ === 'Notice'
          ? `Notice:${(action.value as unknown as NoticeData).notification.key}`
          : actionKey(action);

      if (!groups.has(key)) {
        groups.set(key, { key, kind: action._, actions: [] });
      }

      groups.get(key)!.actions.push(action);
    });

    this.#groups = Array.from(groups.values());
    this.#player = player;

    if (this.#groups.length <= shown) {
      this.#expanded = false;
    }

    this.#draw();
  }

  #draw(): void {
    const element = this.element(),
      overflow = this.#groups.length - shown,
      // The newest, nearest the button, when they don't all fit.
      visible =
        this.#expanded || overflow <= 0
          ? this.#groups
          : this.#groups.slice(-shown),
      rows = visible.map((group) => this.#row(group));

    Array.from(this.#rows.keys())
      .filter((key) => !visible.some((group) => group.key === key))
      .forEach((key) => {
        leave(this.#rows.get(key)!);
        this.#rows.delete(key);
      });

    const wanted: HTMLElement[] = [
      ...(overflow > 0 ? [this.#moreRow(overflow)] : []),
      ...rows,
    ];

    if (overflow <= 0) {
      this.#more?.remove();
      this.#more = null;
    }

    // In order, moving only what has to move: a row put back in the page would slide in again. Rows still going are
    //  left where they are.
    wanted.forEach((row, index) => {
      const staying = Array.from(element.children).filter(
        (child) => !child.classList.contains(leavingClass)
      );

      if (staying[index] !== row) {
        element.insertBefore(row, staying[index] ?? null);
      }
    });
  }

  #moreRow(overflow: number): HTMLButtonElement {
    if (this.#more === null) {
      this.#more = s<HTMLButtonElement>(
        '<button type="button" class="btn-bare ui-notification-more"></button>'
      );
      this.#more.addEventListener('click', () => {
        this.#expanded = !this.#expanded;
        this.#draw();
      });
    }

    this.#more.textContent = this.#expanded
      ? t('NotificationRows.fewer')
      : t('NotificationRows.more', { count: overflow });

    return this.#more;
  }

  #row(group: Group): HTMLElement {
    let row = this.#rows.get(group.key);

    if (!row) {
      row = this.#newRow(group.key);
      this.#rows.set(group.key, row);
    }

    const count = group.actions.length;

    row.dataset.kind = group.kind;
    setNoticeCategory(row, group.actions[0]);
    row.querySelector('.ui-notification-title')!.textContent = this.#title(
      group.actions[0]
    );

    const badge = row.querySelector('.ui-notification-count') as HTMLElement;

    badge.textContent = count > 1 ? t('NotificationRows.count', { count }) : '';
    badge.hidden = count < 2;

    return row;
  }

  #newRow(key: string): HTMLElement {
    const open = s<HTMLButtonElement>(
        `<button type="button" class="btn-bare ui-notification-open"><span class="ui-notification-swatch" aria-hidden="true"></span><span class="ui-notification-title"></span><span class="ui-notification-hint"></span><span class="ui-notification-count"></span></button>`
      ),
      dismiss = button(glyph('close'), {
        variant: 'icon',
        className: 'ui-notification-dismiss',
      }),
      row = s('<div class="ui-notification-row"></div>', open, dismiss),
      group = () => this.#groups.find((group) => group.key === key) ?? null;

    open.querySelector('.ui-notification-hint')!.textContent = t(
      'NotificationRows.open'
    );
    dismiss.setAttribute('aria-label', t('NotificationRows.dismiss'));
    dismiss.title = t('NotificationRows.dismiss');

    open.addEventListener('click', () => {
      const current = group();

      if (!current) {
        return;
      }

      const [first] = current.actions;

      // Made when it's opened, from the action as it is now: a notice's city is the city as it is now (`Notices`).
      createAction(
        first,
        this.#deps.portal,
        this.#deps.transport,
        this.#player ?? undefined
      )?.activate();

      // A notice is dismissed by opening it, as its orb's is: its row goes now, not at the next update.
      if (first._ === 'Notice') {
        this.#deps.dismiss(first);
      }
    });

    const remove = () => {
      const current = group();

      if (!current) {
        return;
      }

      // Focus on to the row after it, or the one before, rather than lost with it.
      const rows = Array.from(
          this.element().querySelectorAll<HTMLElement>(
            `.ui-notification-row:not(.${leavingClass})`
          )
        ),
        index = rows.indexOf(row),
        next = rows[index + 1] ?? rows[index - 1] ?? null,
        focused = row.contains(document.activeElement);

      current.actions.forEach((action) => this.#deps.dismiss(action));

      if (focused) {
        next?.querySelector<HTMLElement>('.ui-notification-open')?.focus();
      }
    };

    dismiss.addEventListener('click', remove);
    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      remove();
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        remove();
      }
    });

    return row;
  }

  // As text: it's set as the row's `textContent` (#855).
  #title(action: PlayerAction): string {
    if (action._ === 'CivilDisorder') {
      return t('Actions.CivilDisorder.title', {
        city: action.value as unknown as City,
        interpolation: { escapeValue: false },
      });
    }

    return noticeText(
      (action.value as unknown as NoticeData).notification,
      'title',
      true
    );
  }
}

export default NotificationRows;
