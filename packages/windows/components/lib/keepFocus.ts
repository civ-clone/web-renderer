// Keeping the keyboard where it was across a redraw that replaces what had the focus (#852): the city screen is drawn
//  afresh on each update, so the button just pressed is gone, and its like has to be found among the new ones.

const CONTROLS =
    'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  // What a control sits in: the queue, a list of improvements, the production panel, the citizens' strip.
  GROUPS = 'ol, ul, section, header, footer';

const controls = (within: ParentNode): HTMLElement[] =>
  Array.from(within.querySelectorAll<HTMLElement>(CONTROLS)).filter(
    (control) => !control.hasAttribute('disabled')
  );

// What a control is, wherever it is: "Move Temple up" is the same button after the Temple has moved.
const nameOf = (control: Element): string =>
  [
    control.tagName,
    control.className,
    control.getAttribute('aria-label') ?? control.textContent ?? '',
  ].join('|');

const kindOf = (element: Element): string =>
  `${element.tagName}|${element.className}`;

// Whether the keyboard put the focus there. A pointer's click focuses a button too, but then the next Enter is meant
//  for the window, as it always was. Where the question can't be asked, it is taken as the keyboard's.
const byKeyboard = (control: Element): boolean => {
  try {
    return control.matches(':focus-visible');
  } catch {
    return true;
  }
};

// Which of its like `element` is, counting from the top of `root`.
const placeAmong = <T extends Element>(like: T[], element: T): number =>
  Math.max(0, like.indexOf(element));

/**
 * Call before the redraw; call what it returns after. That puts the focus on, in order of preference:
 *
 * 1. the control with the same name (its tag, classes and label), the same one of several alike;
 * 2. the first control of the same row, where the row carries a `data-key` (a queued item whose "move up" has gone
 *    because it is now first);
 * 3. the control of the same kind (tag and classes) in the same place in the same group: the same citizen when a
 *    specialist changes. Never one of another kind, where Enter would do something else.
 *
 * It answers whether the focus is now on a control inside `root`: `false` leaves the caller to put it somewhere
 * sensible, as when nothing inside `root` had it to begin with, or a pointer put it there.
 */
export const keepFocus = (root: HTMLElement): (() => boolean) => {
  const focused = document.activeElement as HTMLElement | null;

  if (
    focused === null ||
    focused === root ||
    !root.contains(focused) ||
    !byKeyboard(focused)
  ) {
    return () => false;
  }

  const name = nameOf(focused),
    place = placeAmong(
      controls(root).filter((control) => nameOf(control) === name),
      focused
    ),
    row = focused.closest<HTMLElement>('[data-key]'),
    rowKey = row !== null && root.contains(row) ? row.dataset.key : undefined,
    rowPlace =
      rowKey === undefined
        ? 0
        : placeAmong(
            Array.from(root.querySelectorAll<HTMLElement>('[data-key]')).filter(
              (other) => other.dataset.key === rowKey
            ),
            row!
          ),
    group = focused.closest<HTMLElement>(GROUPS),
    groupKind =
      group !== null && group !== root && root.contains(group)
        ? kindOf(group)
        : null,
    groupPlace =
      groupKind === null
        ? 0
        : placeAmong(
            Array.from(root.querySelectorAll<HTMLElement>(GROUPS)).filter(
              (other) => kindOf(other) === groupKind
            ),
            group!
          ),
    kind = kindOf(focused),
    placeInGroup =
      groupKind === null
        ? 0
        : placeAmong(
            controls(group!).filter((control) => kindOf(control) === kind),
            focused
          );

  return (): boolean => {
    // Not redrawn after all: one of the window's own buttons, outside what was replaced.
    if (focused.isConnected && root.contains(focused)) {
      if (document.activeElement !== focused) {
        focused.focus();
      }

      return true;
    }

    const alike = controls(root).filter((control) => nameOf(control) === name),
      sameRow =
        rowKey === undefined
          ? undefined
          : Array.from(root.querySelectorAll<HTMLElement>('[data-key]')).filter(
              (other) => other.dataset.key === rowKey
            )[rowPlace],
      sameGroup =
        groupKind === null
          ? undefined
          : Array.from(root.querySelectorAll<HTMLElement>(GROUPS)).filter(
              (other) => kindOf(other) === groupKind
            )[groupPlace],
      inGroup =
        sameGroup === undefined
          ? []
          : controls(sameGroup).filter((control) => kindOf(control) === kind),
      target =
        alike[Math.min(place, alike.length - 1)] ??
        (sameRow === undefined ? undefined : controls(sameRow)[0]) ??
        inGroup[Math.min(placeInGroup, inGroup.length - 1)];

    if (target === undefined) {
      return false;
    }

    target.focus();

    return true;
  };
};

export default keepFocus;
