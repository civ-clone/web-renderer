import parseBooleanParam from '@civ-clone/ui-client/lib/parseBooleanParam';

/**
 * Whether the page's query (`location.search`) asks for the grids that aren't finished yet to be offered to new games
 *  (#1063): `?hex=1`, or any other way `parseBooleanParam` reads as on. Off when it doesn't say.
 */
export const offersUnfinishedGrids = (search: string): boolean =>
  parseBooleanParam(new URLSearchParams(search).get('hex'), false);

export default offersUnfinishedGrids;
