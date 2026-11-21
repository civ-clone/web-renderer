// Where the cities' banners hang on the screen (docs/3d-renderer.md §7.5): each below its city's square as the camera
//  sees it, as the 2D map hangs one below its city's square, with the square's middle across, at every copy of the
//  world the stage draws markers at, short of where the haze hides the land, and faded as the haze thickens. The
//  lowest on the screen comes last, to be drawn over the rest, as the 2D map draws a lower row's banners over a higher
//  row's.

import { Orbit, ScenePoint, eye, sightFor, toScreen } from './camera/orbit';
import { copiesNear, markerSight } from './stage';

/** A city whose banner is drawn: its square's middle, and its outline's corners, on the land as it's drawn. */
export type BannerSite = {
  key: string;
  centre: ScenePoint;
  outline: ScenePoint[];
};

/**
 * Where a banner hangs, in the screen's px from its top left: under its square's middle, from its outline's bottom;
 *  and how clear of the haze it is, from 1 short of it to 0 where it hides the land, as three.js thickens it.
 */
export type BannerPlace = {
  key: string;
  x: number;
  y: number;
  clear: number;
};

export type BannerView = {
  orbit: Orbit;
  // How high the camera looks, over its focus.
  look: number;
  // The screen's size, in px.
  width: number;
  height: number;
  // How far along the world repeats, across and down: `null` where it doesn't.
  period: { u: number; v: number | null };
  // How far past the screen's edges a banner's place can be and still reach on to it.
  reach: number;
};

/** Where each of `sites`' banners hangs, at each copy of the world it's seen at, the lowest on the screen last. */
export const bannerPlaces = (
  sites: BannerSite[],
  { orbit, look, width, height, period, reach }: BannerView
): BannerPlace[] => {
  const aspect = width / height,
    from = eye(orbit, look),
    // The way the camera looks, a unit long: the haze thickens with how far along it a point is, not how far off.
    forward = [
      (orbit.focus[0] - from[0]) / orbit.distance,
      (look - from[1]) / orbit.distance,
      (orbit.focus[1] - from[2]) / orbit.distance,
    ],
    // Where the haze begins, and past where it hides the land, and the city with it.
    { near, far } = sightFor(orbit.distance),
    copies = copiesNear(orbit.focus, markerSight(orbit), period),
    onScreen = ([x, y]: [number, number]): [number, number] => [
      ((x + 1) / 2) * width,
      ((1 - y) / 2) * height,
    ],
    places: BannerPlace[] = [];

  sites.forEach(({ key, centre, outline }) =>
    copies.forEach(([du, dv]) => {
      const moved = ([u, up, v]: ScenePoint): ScenePoint => [
          u + du,
          up,
          v + dv,
        ],
        at = moved(centre);

      const depth =
        (at[0] - from[0]) * forward[0]! +
        (at[1] - from[1]) * forward[1]! +
        (at[2] - from[2]) * forward[2]!;

      if (depth > far) {
        return;
      }

      const middle = toScreen(orbit, look, at, aspect);

      // Behind the camera.
      if (middle === null) {
        return;
      }

      const [x] = onScreen(middle);

      if (x < -reach || x > width + reach) {
        return;
      }

      const corners = outline.map((corner) =>
        toScreen(orbit, look, moved(corner), aspect)
      );

      // In part behind the camera.
      if (corners.some((corner) => corner === null)) {
        return;
      }

      const y = Math.max(
        ...corners.map((corner) => onScreen(corner as [number, number])[1])
      );

      if (y < -reach || y > height) {
        return;
      }

      // As three.js's linear fog: smoothly from none at `near` to all at `far`.
      const through = Math.min(1, Math.max(0, (depth - near) / (far - near)));

      places.push({
        key,
        x,
        y,
        clear: 1 - through * through * (3 - 2 * through),
      });
    })
  );

  return places.sort((a, b) => a.y - b.y);
};
