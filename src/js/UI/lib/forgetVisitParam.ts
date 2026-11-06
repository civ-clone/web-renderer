/**
 * Takes a `?name=` setting off the page's address, for when the player chooses in Options: it speaks for one visit and
 *  outranks the option, so left in place it would undo their choice at the next load.
 */
export const forgetVisitParam = (name: string): void => {
  const url = new URL(window.location.href);

  if (!url.searchParams.has(name)) {
    return;
  }

  url.searchParams.delete(name);

  window.history.replaceState(window.history.state, '', url);
};

export default forgetVisitParam;
