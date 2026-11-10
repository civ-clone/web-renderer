import {
  WindowChrome,
  WindowChromeHost,
} from '@civ-clone/ui-component-window/windowChrome';
import { button } from '@civ-clone/ui-component-button/button';
import eyebrowFor from '@civ-clone/ui-component-window/windowEyebrows';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

// The modern interface's window chrome (#738, #860): an eyebrow over the title, a footer of the window's actions, Enter
//  for the primary, a fade as it closes, and focus back where it was.
export class FramedChrome implements WindowChrome {
  #host: WindowChromeHost;
  // What had focus as the window opened, to have it back as it closes (#738).
  #opener: HTMLElement | null = null;
  // What the chrome moved out of the body into its footer, and where from: put back before the window is built again,
  //  so the body it's built from is whole (#738).
  #adopted: [Element, Element][] = [];

  constructor(host: WindowChromeHost) {
    this.#host = host;
  }

  attach(): void {
    this.#host.element().classList.add('ui-window');
    this.#bindKeys();
  }

  /**
   * The new chrome (#738): an eyebrow over the title, the body, which is the part that scrolls, and a footer with the
   *  window's actions, the primary last, showing Enter. A window's own footer, at the end of its body, is moved into it,
   *  so no window needs to know which chrome it's in; one with none gets a quiet Close.
   */
  build(): void {
    const { classes, eyebrow: own } = this.#host.settings(),
      eyebrow =
        own ??
        eyebrowFor(Array.isArray(classes) ? classes : `${classes}`.split(' ')),
      titles = s(
        `<div class="ui-window-titles"><h3>${this.#host.title()}</h3></div>`
      );

    if (eyebrow !== null) {
      const line = s('<p class="ui-window-eyebrow"></p>');

      line.textContent = eyebrow;
      titles.prepend(line);
    }

    this.#host
      .element()
      .append(
        this.#host.draggable(
          s(
            '<header class="ui-window-header"></header>',
            titles,
            ...this.#host.headerActions()
          )
        ),
        this.#host.body(),
        s(
          '<footer class="ui-window-footer"><div class="ui-window-actions"></div></footer>'
        )
      );

    this.#adoptFooter();
  }

  // Moves the body's own footer (one that holds only buttons), or the primary button the body ends in, into the
  //  chrome's. The footer itself moves, so a window that keeps it and adds to it later still has it. What it then
  //  holds is put in order, and Enter shown on the primary, once the window has finished building (#738).
  #adoptFooter(): void {
    const footer = this.#host
        .element()
        .querySelector(':scope > .ui-window-footer'),
      actions = footer?.querySelector('.ui-window-actions');

    if (!footer || !actions) {
      return;
    }

    const own = Array.from(
        this.#host
          .element()
          .querySelectorAll(
            ':scope > .body > footer:last-child, :scope > .body > :last-child > footer:last-child'
          )
      ).find((candidate) =>
        // Buttons, or nothing yet: not a footer of words.
        Array.from(candidate.childNodes).every((node) =>
          node instanceof Element
            ? node.matches('button')
            : !node.textContent?.trim()
        )
      ),
      lone = this.#host
        .element()
        .querySelector(
          ':scope > .body > button.btn-primary:last-child, :scope > .body > :last-child > button.btn-primary:last-child'
        );

    this.#adopted = [own, lone]
      .filter((item): item is Element => item !== null && item !== undefined)
      .map((item) => [item, item.parentElement!]);

    // A body drawn again brings its own buttons, or none: what the last one gave goes either way.
    actions.replaceChildren(
      ...([own, lone].filter(
        (item) => item !== null && item !== undefined
      ) as Element[])
    );

    queueMicrotask(() => this.#settleFooter());
  }

  // Puts back what the footer took, before the window is emptied to be built again.
  building(): void {
    this.#adopted.forEach(([element, parent]) => parent.append(element));
    this.#adopted = [];
  }

  // The footer's buttons in order, the quiet first and the primary last, focus kept where it was, a quiet Close where
  //  there are none, and Enter shown on the primary.
  #settleFooter(): void {
    const footer = this.#host
        .element()
        .querySelector(':scope > .ui-window-footer'),
      actions = footer?.querySelector(
        '.ui-window-actions'
      ) as HTMLElement | null;

    if (!footer || !actions) {
      return;
    }

    const rank = (element: Element) =>
        element.classList.contains('btn-quiet')
          ? 0
          : element.classList.contains('btn-primary')
          ? 2
          : 1,
      focused = document.activeElement;

    [
      actions,
      ...Array.from(actions.querySelectorAll(':scope > footer')),
    ].forEach((holder) => {
      const buttons = Array.from(holder.children).filter((child) =>
        child.matches('button')
      );

      buttons
        .sort((a, b) => rank(a) - rank(b))
        .forEach((button) => holder.append(button));
    });

    // Moving a button takes focus off it.
    if (focused instanceof HTMLElement && actions.contains(focused)) {
      focused.focus();
    }

    // The window's own footer before its lone primary, which goes last.
    const lone = actions.querySelector(':scope > button.btn-primary');

    if (lone) {
      actions.append(lone);
    }

    actions.querySelector(':scope > .ui-window-close')?.remove();

    if (!actions.querySelector('button') && this.#host.settings().canClose) {
      actions.append(
        h(
          button(t('Window.close'), {
            variant: 'quiet',
            hotkey: 'Escape',
            className: 'ui-window-close',
          }),
          {
            click: () => this.#host.close(),
          }
        )
      );
    }

    // The primary's key on it, as Cancel has Esc.
    const primary = actions.querySelector('.btn-primary');

    if (primary instanceof HTMLElement && !primary.dataset.hotkey) {
      primary.dataset.hotkey = 'Enter';
      primary.setAttribute('aria-keyshortcuts', 'Enter');
    }
  }

  // Enter runs the primary action, unless it's pressed on something that takes Enter itself. Caught on the way in,
  //  before a window's own keys, which close it on Enter (#738).
  #bindKeys(): void {
    this.#host.element().addEventListener(
      'keydown',
      (event: KeyboardEvent) => {
        if (
          event.key !== 'Enter' ||
          event.repeat ||
          event.isComposing ||
          (event.target instanceof Element &&
            event.target !== this.#host.element() &&
            event.target.closest(
              'button, a[href], input, select, textarea, summary, [contenteditable], [role="button"]'
            ))
        ) {
          return;
        }

        const primary = this.#host
          .element()
          .querySelector(
            ':scope > .ui-window-footer .btn-primary'
          ) as HTMLButtonElement | null;

        if (!primary || primary.disabled || primary.closest('[hidden]')) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        primary.click();
      },
      true
    );
  }

  // The window closes at once; a copy of it, which takes no input, fades in its place (#738).
  closing(): void {
    if (
      !this.#host.element().isConnected ||
      this.#host.element().classList.contains('maximised') ||
      // A copy of a canvas is blank.
      this.#host.element().querySelector('canvas') ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    ) {
      return;
    }

    const box = this.#host.element().getBoundingClientRect(),
      ghost = this.#host.element().cloneNode(true) as HTMLElement,
      shell = document.createElement('div');

    // Not a second element of the same id, nor anything that can take focus.
    [ghost, ...Array.from(ghost.querySelectorAll('[id], [for]'))].forEach(
      (element) => {
        element.removeAttribute('id');
        element.removeAttribute('for');
      }
    );
    shell.setAttribute('inert', '');
    // Drawn as the window was, where it was: without the classes that place it or lift it into a stacking order.
    shell.className = [
      ...Array.from(this.#host.element().classList).filter(
        (name) => !['modal', 'position-auto'].includes(name)
      ),
      'ui-window-ghost',
    ].join(' ');
    shell.setAttribute('aria-hidden', 'true');
    shell.style.left = `${box.left}px`;
    shell.style.top = `${box.top}px`;
    shell.style.width = `${box.width}px`;
    shell.style.height = `${box.height}px`;
    shell.append(...Array.from(ghost.childNodes));
    shell.addEventListener('animationend', () => shell.remove());
    document.body.append(shell);

    // Gone even where the animation never runs.
    setTimeout(() => shell.remove(), 200);
  }

  updated(): void {
    this.#adoptFooter();
  }

  // Once: shown again, it would find its own focus.
  opening(): void {
    if (this.#opener !== null) {
      return;
    }

    const active = document.activeElement;

    this.#opener =
      active instanceof HTMLElement &&
      active !== document.body &&
      !this.#host.element().contains(active)
        ? active
        : null;
  }

  closed(): boolean {
    const active = document.activeElement;

    // Something has focus already: the window that closing this one opened (the next notice).
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      active.isConnected
    ) {
      return true;
    }

    // Back to what had focus as it opened, where that can take it (#738); not behind a modal window, say.
    this.#opener?.focus();

    return this.#opener !== null && document.activeElement === this.#opener;
  }
}

export const framedChrome = (host: WindowChromeHost): WindowChrome =>
  new FramedChrome(host);

export default framedChrome;
