// A watcher opens a city (#613): the page asks for it by its square (a city the watcher doesn't own reaches the page
//  as a stand-in with an id of its own), and it is answered in full, as a Diplomat's investigation is sent, for the
//  same read-only screen. A city of a civilisation watched, or any city when the whole map is watched. A city the view
//  doesn't take in, or none on the square (razed, or the page's data behind the game), is answered with `null` rather
//  than a failure: a failed request opens the "something went wrong" window, and this is a click on a square that
//  turned out to hold nothing to open.

import { ClientContext } from './ClientContext';
import Transport, { TransportDisposer } from '../Transport';
import answer from '../answer';
import cityInFull from './cityInFull';

export type ObserveCityContext = Pick<
  ClientContext,
  'view' | 'dataFilter' | 'cities'
>;

export const registerObserveCity = (
  transport: Transport<TransportDataMap>,
  ctx: ObserveCityContext
): TransportDisposer =>
  answer(transport, 'observeCity', ({ x, y }: { x: number; y: number }) => {
    // A razed city stays in the registry with `destroyed` set, as `getByTile` knows: a new city on the ruins is the one.
    const city = ctx.cities
      .entries()
      .find(
        (city) =>
          !city.destroyed() && city.tile().x() === x && city.tile().y() === y
      );

    if (
      !city ||
      (ctx.view.owners().length > 0 && !ctx.view.owns(city.player()))
    ) {
      return null;
    }

    return cityInFull(city, ctx);
  });

export default registerObserveCity;
