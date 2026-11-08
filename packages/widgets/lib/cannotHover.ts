/** Whether this is a touch screen: its main pointer can't hover, and it probably has no keyboard. Not in the test DOM
 *  unless a test gives it. */
export const cannotHover = (): boolean =>
  window.matchMedia?.('(hover: none)').matches ?? false;

export default cannotHover;
