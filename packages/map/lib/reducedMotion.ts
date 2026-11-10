/**
 * Whether the player has asked their system for less motion (#856). The stylesheets answer `prefers-reduced-motion`
 * themselves; this is for what is drawn on a canvas or moved by a script. `false` where the page can't say.
 */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

export default prefersReducedMotion;
