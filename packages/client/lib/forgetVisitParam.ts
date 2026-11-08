const forgotten = new Set<string>();

/** An address without the settings forgotten this visit, for history entries beneath ours, which still hold them. */
export const withoutForgottenParams = (href: string): string => {
  if (forgotten.size === 0) {
    return href;
  }

  const url = new URL(href);

  forgotten.forEach((name) => url.searchParams.delete(name));

  return url.toString();
};

/**
 * Takes a `?name=` setting off the page's address, for when the player chooses in Options: it speaks for one visit and
 *  outranks the option, so left in place it would undo their choice at the next load.
 */
export const forgetVisitParam = (name: string): void => {
  forgotten.add(name);

  const url = new URL(window.location.href);

  if (!url.searchParams.has(name)) {
    return;
  }

  url.searchParams.delete(name);

  window.history.replaceState(window.history.state, '', url);
};

export default forgetVisitParam;
