// A tooltip with a breakdown (#742): a titled panel, its rows as a definition list and a total under them, shown after
//  a moment's hover or at once on focus, and gone on leaving, on blur, or on Escape. One panel serves every tooltip,
//  added last to `body` when it opens: later in the document than the map and the panels, so it's drawn over them
//  without a stacking order of its own, and under a modal window, which is above everything.

export interface TooltipContent {
  title: string;
  rows: [label: string, value: string][];
  total?: [label: string, value: string] | null;
}

export interface TooltipOptions {
  // How long a pointer rests on the anchor before it opens, in ms.
  delay?: number;
  // Names what the tooltip is about, so one open over an anchor that's been rebuilt (the top bar is, on every update)
  //  moves to the anchor that took its place rather than closing.
  key?: string | null;
}

interface Open {
  anchor: HTMLElement;
  content: () => TooltipContent;
  key: string | null;
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

// Set as text, not markup: the figures come with names in them.
const fill = (element: HTMLElement, { title, rows, total }: TooltipContent) => {
  const heading = document.createElement('h4'),
    list = document.createElement('dl');

  heading.textContent = title;

  [...rows, ...(total ? [total] : [])].forEach(([label, value], index) => {
    const term = document.createElement('dt'),
      definition = document.createElement('dd');

    term.textContent = label;
    definition.textContent = value;

    if (total && index === rows.length) {
      term.className = definition.className = 'total';
    }

    list.append(term, definition);
  });

  element.replaceChildren(heading, list);
};

// Below the anchor, or above it where there's no room below, and kept inside the window.
const place = (element: HTMLElement, anchor: HTMLElement) => {
  const box = anchor.getBoundingClientRect(),
    width = element.offsetWidth,
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

  // Only this: Escape that closes a tooltip doesn't close the window under it too.
  event.preventDefault();
  event.stopPropagation();

  hideTooltip();
};

const show = (current: Open) => {
  const element = panel();

  if (open && open.anchor !== current.anchor) {
    open.anchor.removeAttribute('aria-describedby');
  }

  open = current;

  fill(element, current.content());
  // Last, each time, so it's drawn over whatever was added since.
  document.body.append(element);
  element.hidden = false;
  place(element, current.anchor);

  current.anchor.setAttribute('aria-describedby', panelId);
  document.addEventListener('keydown', onEscape, true);
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
};

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
  const current: Open = { anchor, content, key };
  let timer: ReturnType<typeof setTimeout> | null = null;

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
    cancel();
    timer = setTimeout(() => show(current), delay);
  });
  anchor.addEventListener('mouseleave', () => {
    cancel();

    if (open?.anchor === anchor) {
      hideTooltip();
    }
  });
  anchor.addEventListener('focus', () => show(current));
  anchor.addEventListener('blur', () => {
    if (open?.anchor === anchor) {
      hideTooltip();
    }
  });

  // The anchor it was open over has gone, and this one has taken its place: open over this instead, with what it says
  //  now.
  if (
    key !== null &&
    open !== null &&
    open.key === key &&
    !open.anchor.isConnected
  ) {
    queueMicrotask(() => {
      if (anchor.isConnected && open?.key === key) {
        show(current);
      }
    });
  }

  return anchor;
};

export default tooltip;
