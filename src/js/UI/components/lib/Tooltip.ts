// A tooltip with a breakdown (#742): a titled panel, its rows as a definition list and a total under them, shown after
//  a moment's hover or at once on focus, and gone on leaving, on blur, or on Escape. One panel serves every tooltip,
//  added last to `body` when it opens: later in the document than the map and the panels, so it's drawn over them
//  without a stacking order of its own, and under a modal window, which is above everything.

// Text, or an element with icons in it that names what they are for a screen reader (#748).
export type TooltipText = string | Node;

export interface TooltipContent {
  title: string;
  rows: [label: TooltipText, value: TooltipText][];
  total?: [label: TooltipText, value: TooltipText] | null;
}

export interface TooltipOptions {
  // How long a pointer rests on the anchor before it opens, in ms.
  delay?: number;
  // Names what the tooltip is about, so one open over an anchor that's been rebuilt (the top bar is, on every update)
  //  moves to the anchor that took its place rather than closing.
  key?: string | null;
}

// Where on the screen it's about, in the window's px.
type Box = Pick<DOMRect, 'left' | 'top' | 'bottom'>;

interface Open {
  anchor: HTMLElement;
  // Where it's drawn from: the anchor's own box, or a part of it (a banner on the map's canvas).
  box: () => Box;
  content: () => TooltipContent;
  key: string | null;
  // How it was opened, which says how it moves to an anchor that replaced its own.
  via: 'hover' | 'focus';
}

const panelId = 'tooltip',
  // From where it's drawn, as a gap between the anchor and the panel.
  gap = 4;

let open: Open | null = null;

const panel = (): HTMLElement => {
  let element = document.getElementById(panelId);

  if (element === null) {
    element = document.createElement('div');
    element.id = panelId;
    element.className = 'tooltip';
    element.setAttribute('role', 'tooltip');
    element.hidden = true;
  }

  return element;
};

// A selector a browser knows but the test DOM may not (`:hover`, `:focus-visible`), with what to assume without it.
const matches = (
  element: HTMLElement,
  selector: string,
  otherwise: boolean
) => {
  try {
    return element.matches(selector);
  } catch {
    return otherwise;
  }
};

// Set as text, not markup: the figures come with names in them. An element is added as it is.
const fill = (element: HTMLElement, { title, rows, total }: TooltipContent) => {
  const heading = document.createElement('h4'),
    list = document.createElement('dl');

  heading.textContent = title;

  [...rows, ...(total ? [total] : [])].forEach(([label, value], index) => {
    const term = document.createElement('dt'),
      definition = document.createElement('dd');

    term.append(label);
    definition.append(value);

    if (total && index === rows.length) {
      term.className = definition.className = 'total';
    }

    list.append(term, definition);
  });

  element.replaceChildren(heading, list);
};

// Below the anchor, or above it where there's no room below, and kept inside the window. Measured from the corner,
//  so where it was last time doesn't squeeze it.
const place = (element: HTMLElement, box: Box) => {
  element.style.left = element.style.top = '0';

  const width = element.offsetWidth,
    height = element.offsetHeight,
    below = box.bottom + gap,
    top =
      below + height > window.innerHeight && box.top - gap - height >= 0
        ? box.top - gap - height
        : below;

  element.style.left = `${Math.max(
    gap,
    Math.min(box.left, window.innerWidth - width - gap)
  )}px`;
  element.style.top = `${top}px`;
};

const onEscape = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || open === null) {
    return;
  }

  // Pressed on the item the tooltip is about, Escape closes only the tooltip; pressed anywhere else (in a window),
  //  it does that too, and then whatever it does there.
  if (event.target instanceof Node && open.anchor.contains(event.target)) {
    event.preventDefault();
    event.stopPropagation();
  }

  hideTooltip();
};

// Placed once, so it closes rather than drift from what it's about.
const onMove = () => hideTooltip();

const show = (current: Open) => {
  if (!current.anchor.isConnected) {
    return;
  }

  const element = panel();

  if (open && open.anchor !== current.anchor) {
    open.anchor.removeAttribute('aria-describedby');
  }

  open = current;

  fill(element, current.content());
  // Last, each time, so it's drawn over whatever was added since.
  document.body.append(element);
  element.hidden = false;
  place(element, current.box());

  current.anchor.setAttribute('aria-describedby', panelId);
  document.addEventListener('keydown', onEscape, true);
  window.addEventListener('scroll', onMove, true);
  window.addEventListener('resize', onMove);
};

/** Closes the tooltip that's open, if one is. */
export const hideTooltip = (): void => {
  if (open === null) {
    return;
  }

  open.anchor.removeAttribute('aria-describedby');
  open = null;

  panel().hidden = true;
  document.removeEventListener('keydown', onEscape, true);
  window.removeEventListener('scroll', onMove, true);
  window.removeEventListener('resize', onMove);
};

/** Closes the tooltip that's open, if its anchor is in `container`: for an anchor about to go, which fires no `mouseleave`
 *  or `blur` as it does. */
export const hideTooltipWithin = (container: Node): void => {
  if (open !== null && container.contains(open.anchor)) {
    hideTooltip();
  }
};

/**
 * Opens a tooltip of `content()` at once over `box()`, a part of `anchor` that isn't an element of its own (a city's
 *  banner on the map's canvas, #747), for as long as its caller says: it waits, and closes it with `hideTooltip`.
 */
export const showTooltipOver = (
  anchor: HTMLElement,
  box: () => Box,
  content: () => TooltipContent
): void => show({ anchor, content, key: null, via: 'hover', box });

/** Whether a tooltip is open over `anchor`. */
export const tooltipOpenOver = (anchor: HTMLElement): boolean =>
  open?.anchor === anchor;

const focusable = (element: HTMLElement) =>
  element.matches('a[href], button, input, select, textarea, [tabindex]');

/**
 * Gives `anchor` a tooltip of `content()`, read each time it opens. The anchor's own `title` goes, so there's one
 *  tooltip, and it's made focusable if it isn't, so the keyboard reaches it.
 */
export const tooltip = (
  anchor: HTMLElement,
  content: () => TooltipContent,
  { delay = 400, key = null }: TooltipOptions = {}
): HTMLElement => {
  const box = () => anchor.getBoundingClientRect(),
    byHover: Open = { anchor, content, key, via: 'hover', box },
    byFocus: Open = { anchor, content, key, via: 'focus', box };
  let timer: ReturnType<typeof setTimeout> | null = null,
    hovering = false;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  anchor.removeAttribute('title');

  if (!focusable(anchor)) {
    anchor.setAttribute('tabindex', '0');
  }

  anchor.addEventListener('mouseenter', () => {
    hovering = true;
    cancel();
    timer = setTimeout(() => {
      timer = null;

      // Still there and still pointed at: the bar may have been rebuilt in the meantime.
      if (hovering && anchor.isConnected) {
        show(byHover);
      }
    }, delay);
  });
  anchor.addEventListener('mouseleave', () => {
    hovering = false;
    cancel();

    if (open?.anchor === anchor) {
      hideTooltip();
    }
  });
  // From the keyboard: a click focuses it too, and that shouldn't open it at once.
  anchor.addEventListener('focus', () => {
    if (matches(anchor, ':focus-visible', true)) {
      show(byFocus);
    }
  });
  anchor.addEventListener('blur', () => {
    if (open?.anchor === anchor) {
      hideTooltip();
    }
  });

  if (open !== null && !open.anchor.isConnected) {
    const was = open;

    // This anchor took the place of the one it was open over: open over this instead, with what it says now. Focus
    //  goes back where it was; a pointer has to still be over it.
    if (key !== null && was.key === key) {
      queueMicrotask(() => {
        if (open !== was || !anchor.isConnected) {
          return;
        }

        if (was.via === 'focus') {
          anchor.focus();
          show(byFocus);

          return;
        }

        show(byHover);

        // The browser says what's under the pointer once it has laid the new anchor out.
        setTimeout(() => {
          if (open?.anchor === anchor && !matches(anchor, ':hover', true)) {
            hideTooltip();
          }
        }, 50);
      });
    }

    // Gone, with nothing in its place: after every anchor rebuilt with it has had its chance to take it over.
    setTimeout(() => {
      if (open === was) {
        hideTooltip();
      }
    });
  }

  return anchor;
};

export default tooltip;
