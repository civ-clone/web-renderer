// What three.js draws (docs/3d-renderer.md §9): the land under a sky, lit by the sun and the sky's light, with haze into
//  the distance. Kept apart from the view, which tests stand a stage of their own in for: a test has no GPU to draw
//  with.
//
// The land comes in chunks (`terrain/chunks.ts`), each drawn at every copy of the world the camera can see (§3.1), so
//  the land carries on past the world's seam whichever way it looks. The sea's surface lies over it (`water.ts`). The
//  camera is an orbit (`camera/orbit.ts`): the view says where it is, and the haze, how far it sees, and the sun's
//  shadows, fitted to what it sees, follow its distance.

import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { ChunkMesh } from './terrain/chunks';
import landMaterial from './landMaterial';
import {
  FIGURES_PART,
  Faded,
  MarkerKit,
  drawMarker,
  fade,
  unfade,
} from './markers/drawMarker';
import { TileMarker } from './markers/markerFor';
import { OverlayMesh } from './overlay/overlayMesh';
import { FIELD_OF_VIEW, Orbit, eye, sightFor } from './camera/orbit';
import Water, { Clouds, Ground } from './water';
import YieldIcons from './yieldIcons';
import { YieldMesh } from './yields';

/** What the stage has drawn, for the debug overlay. */
export type StageStats = {
  drawCalls: number;
  triangles: number;
  geometries: number;
};

/** Draws the scene on a canvas. */
export interface Stage {
  render(): void;
  /** The canvas's box in the page's px, and how many of the screen's pixels one is. */
  resize(width: number, height: number, pixelRatio: number): void;
  /** The land's chunk `i` across and `j` down, drawn at every copy of the world: one drawn before is replaced. */
  setChunk(i: number, j: number, mesh: ChunkMesh): void;
  /**
   * What's laid on the land of chunk `i` across and `j` down (roads, fields, specials, huts), drawn at every copy of
   *  the world as the land is: one laid before is replaced, and nothing takes it away.
   */
  setOverlay(i: number, j: number, mesh: OverlayMesh | null): void;
  /**
   * What's marked on the square `key` (`x,y`), standing at `at` (`u`, height, `v`), drawn at every copy of the world:
   *  one marked before is replaced, and nothing takes it away.
   */
  setMarker(
    key: string,
    at: readonly [number, number, number],
    marker: TileMarker | null
  ): void;
  /**
   * A walk under way (`id`, `walks.ts`), drawn as `marker`, its units alone with no city: one drawn before for it is
   *  replaced, and `null` takes it away.
   */
  setWalker(id: string, marker: TileMarker | null): void;
  /**
   * Where the walker `id` is now (`u`, height, `v`, on the world's own copy) and the way its figures face, drawn there at
   *  every copy of the world in sight.
   */
  placeWalker(
    id: string,
    at: readonly [number, number, number],
    facing: number
  ): void;
  /**
   * How solid the walker `id` is drawn, from 1 down to gone at 0, as a unit falling in battle fades (`battles.ts`): with
   *  materials of its own, so no other marker fades with it. Drawn again for it (`setWalker`), it's solid.
   */
  fadeWalker(id: string, opacity: number): void;
  /** What each square yields (`y`), drawn at every copy of the world in sight: what was drawn before is replaced. */
  setYields(mesh: YieldMesh | null): void;
  /**
   * The camera, round its focus raised to `height`, the land's there; and the world drawn as far round as `period`
   *  says, if the view's stopped at the poles, rather than as the world wraps.
   */
  view(
    orbit: Orbit,
    height: number,
    period?: { u: number; v: number | null }
  ): void;
  stats(): StageStats;
  dispose(): void;
}

export type StageOptions = {
  // How far along the world repeats, across and down (`null` down for a world that doesn't wrap over the poles).
  period: { u: number; v: number | null };
  // How the land's points lie on the ground, for the sea's surface to read their heights.
  ground: Ground;
  // The icon for a yield (`Food`, `Production`, `Trade`), the map's pack's own or the interface's, or nothing where the
  //  art has none.
  yieldIcon?: (name: string) => CanvasImageSource | null;
};

/** Something drawn at every copy of the world in sight: where it lies, how to make another of it, and those drawn now. */
export type Placed = {
  at: readonly [number, number, number];
  make: () => Object3D;
  drawn: Object3D[];
  // A marker as drawn, which its copies are cloned from.
  original?: Object3D;
};

export type StageFactory = (
  canvas: HTMLCanvasElement,
  options: StageOptions
) => Stage;

// A muted palette (D2): an overcast sky, and a sun low enough to model the relief.
const SKY = 0x9fb3c4,
  SKY_LIGHT = 0xd6e2ec,
  GROUND_LIGHT = 0x5b5140,
  SUN = 0xfff0d8;

/**
 * The copies of the world within `sight` of `focus`, as offsets on the ground: every multiple of the period across, and
 *  down where it wraps, whose copy comes within that distance.
 */
export const copiesNear = (
  focus: readonly [number, number],
  sight: number,
  period: { u: number; v: number | null }
): [number, number][] => {
  const along = (middle: number, span: number | null): number[] => {
    if (span === null) {
      return [0];
    }

    const found: number[] = [];

    // A copy's ground runs from its offset to a period on: it's in sight if that meets the focus's reach.
    for (
      let k = Math.floor((middle - sight) / span);
      k * span <= middle + sight;
      k++
    ) {
      found.push(k * span);
    }

    return found;
  };

  return along(focus[0], period.u).flatMap((across) =>
    along(focus[1], period.v).map((down): [number, number] => [across, down])
  );
};

/** The planes that keep what lies between the poles, from 0 to `extent` down the ground: three.js keeps n·p + c ≥ 0. */
export const polesAt = (extent: number): Plane[] => [
  new Plane(new Vector3(0, 0, 1), 0),
  new Plane(new Vector3(0, 0, -1), extent),
];

/**
 * The copies of the world to draw what's laid on a chunk at, from those in sight (`copies`), its reach down the ground
 *  being `span`. With the view stopped at the poles (`stopped`) of a world that wraps over them (`period`), the land just
 *  inside a pole is the far edge's, by wrapping: on a staggered or hex world, between the first row's squares lie the
 *  last row's southern halves, and between the last row's the first row's northern halves. So what reaches past a pole
 *  is drawn a period round as well, where the poles' planes keep only what lies over the land.
 */
export const overlayCopies = (
  copies: readonly (readonly [number, number])[],
  [top, bottom]: readonly [number, number],
  extent: number,
  period: number | null,
  stopped: boolean
): [number, number][] =>
  copies.flatMap(([u, v]): [number, number][] => [
    [u, v],
    ...(stopped && period !== null && bottom > extent
      ? [[u, v - period] as [number, number]]
      : []),
    ...(stopped && period !== null && top < 0
      ? [[u, v + period] as [number, number]]
      : []),
  ]);

// The sun's shadow map's size, in texels a side, and how far the sun is from what it lights (its offset below).
const SHADOW_MAP = 2048,
  SUN_DISTANCE = Math.hypot(30, 40, 20);

export const createStage: StageFactory = (
  canvas,
  { period, ground, yieldIcon }
) => {
  const renderer = new WebGLRenderer({ antialias: true, canvas }),
    scene = new Scene(),
    camera = new PerspectiveCamera(
      (FIELD_OF_VIEW * 180) / Math.PI,
      1,
      0.1,
      400
    ),
    land = new Group(),
    // The land's colour at each point, and its surfaces' detail over it (`landMaterial.ts`).
    { material, detail } = landMaterial(period, ground.rows * ground.spacingV),
    sun = new DirectionalLight(SUN, 2.6),
    // What's drawn at every copy of the world in sight: the land's chunks by `i,j`, and the squares' markers by `x,y`.
    //  Each has where it lies, how to make one copy of it, and the copies drawn now.
    chunks = new Map<string, Placed & { geometry: BufferGeometry }>(),
    // What's laid on the land, by chunk: its colours in its vertices, a little in front of the land so it doesn't
    //  flicker with it where it lies close.
    overlays = new Map<
      string,
      Placed & { geometry: BufferGeometry; span: [number, number] }
    >(),
    overlayMaterial = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -6,
      // Its shadows clipped with it.
      clipShadows: true,
    }),
    // What's laid on the land stops where the land does past a pole the view's stopped at: the last row's fields and
    //  roads on a staggered or hex world reach a little past it, where the land, the sea and the cloud stop (and are
    //  drawn a period round too, where the land is theirs: `overlayCopies`).
    extent = ground.rows * ground.spacingV,
    poles = polesAt(extent),
    markers = new Map<string, Placed>(),
    // The units walking, by their walk's id (`walks.ts`), and fighting, by their battle's (`battles.ts`), each drawn as
    //  its own marker, with no city; the way each faces, how solid it's drawn, and its own materials, once faded.
    walkers = new Map<
      string,
      Placed & { facing: number; opacity: number; faded: Faded }
    >(),
    markersGroup = new Group(),
    kit = new MarkerKit(),
    // What each square yields, over the land at every copy of the world, when they're shown.
    yieldsGroup = new Group(),
    yields = new YieldIcons(yieldIcon ?? ((): null => null)),
    water = new Water(ground, new Color(SKY)),
    clouds = new Clouds(water.texture(), ground),
    fog = new Fog(SKY, 30, 110);

  // The copies of the world drawn now, and their key, to tell when they change.
  let copies: [number, number][] = [[0, 0]],
    copiesKey = '0,0',
    // The markers', fewer: past about twice the camera's distance they're too small and hazy to matter.
    markerCopies: [number, number][] = [[0, 0]],
    markerCopiesKey = '0,0',
    // Whether the view's stopped at the poles.
    stopped = false,
    // The yields drawn now, at every copy of the world in sight, or none.
    yieldsPlaced: Placed | null = null;

  renderer.outputColorSpace = SRGBColorSpace;
  // For what's laid on the land, to stop at a pole the view's stopped at.
  renderer.localClippingEnabled = true;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  scene.background = new Color(SKY);
  // Haze into the distance (§9.3), so the land fades into the sky rather than ending at an edge: how far follows the
  //  camera's distance.
  scene.fog = fog;
  scene.add(new HemisphereLight(SKY_LIGHT, GROUND_LIGHT, 0.9));
  scene.add(land);
  scene.add(markersGroup);
  scene.add(yieldsGroup);
  scene.add(water.mesh);
  scene.add(clouds.mesh);

  // From the south-east and well up, so slopes facing it are lit and the far sides of ridges fall into shade.
  sun.position.set(30, 40, 20);
  // One shadow map, over what the camera sees round its focus (`view`).
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // A thing's copies, one for each copy of the world drawn now, in `parent`.
  const copiesOf = (
    placed: Placed,
    parent: Group,
    at: [number, number][] = copies
  ): Object3D[] =>
    at.map(([offsetU, offsetV]) => {
      const drawn = placed.make();

      drawn.position.set(
        placed.at[0] + offsetU,
        placed.at[1],
        placed.at[2] + offsetV
      );
      parent.add(drawn);

      return drawn;
    });

  // What's laid on a chunk, at the copies it's drawn at.
  const overlayCopiesOf = (
    overlay: Placed & { span: [number, number] }
  ): Object3D[] =>
    copiesOf(
      overlay,
      land,
      overlayCopies(copies, overlay.span, extent, period.v, stopped)
    );

  // A walker's copies turned the way it faces: only its figures turn, its flag over them as ever.
  const face = (walker: Placed & { facing: number }): void =>
    walker.drawn.forEach((drawn) => {
      const figures = drawn.getObjectByName(FIGURES_PART);

      if (figures !== undefined) {
        figures.rotation.y = walker.facing;
      }
    });

  // A marker's original, made from what it marks: casting shadows on the land, as the models will.
  const markerOf = (marker: TileMarker): Object3D => {
    const original = drawMarker(kit, marker);

    original.traverse((object) => {
      object.castShadow = object instanceof Mesh;
    });

    return original;
  };

  // Every city's size and name it has had would be kept otherwise.
  const sweep = (): void => {
    if (kit.sweepDue) {
      kit.sweep(
        [...markers.values(), ...walkers.values()].flatMap(({ original }) =>
          original === undefined ? [] : [original]
        )
      );
    }
  };

  const view = (
    orbit: Orbit,
    height: number,
    seen: { u: number; v: number | null } = period
  ): void => {
    const [u, v] = orbit.focus,
      [x, y, z] = eye(orbit, height),
      { near, far } = sightFor(orbit.distance);

    camera.position.set(x, y, z);
    camera.lookAt(u, height, v);
    camera.far = far * 1.2;
    // As near as anything gets, no nearer: the depth there is to go round is spread over less, so what's laid a few
    //  thousandths over the land doesn't flicker with it far out.
    camera.near = Math.max(0.1, orbit.distance * 0.02);
    camera.updateProjectionMatrix();
    fog.near = near;
    fog.far = far;

    // The sun's direction stays the same wherever the camera looks, and its shadows cover what the camera sees round
    //  its focus, which the haze doesn't hide much of.
    const reach = orbit.distance * 2.2,
      shadow = sun.shadow.camera;

    sun.position.set(u + 30, height + 40, v + 20);
    sun.target.position.set(u, height, v);
    shadow.left = -reach;
    shadow.right = reach;
    shadow.top = reach;
    shadow.bottom = -reach;
    // As deep as it's wide, round the focus, the sun being as far from it as its offset is long.
    shadow.near = Math.max(0.5, SUN_DISTANCE - reach * 1.6);
    shadow.far = SUN_DISTANCE + reach * 1.6;
    shadow.updateProjectionMatrix();

    // The sea's surface under the camera, as far as it sees.
    water.follow(
      u,
      v,
      far * 2.2,
      sun.position.clone().sub(sun.target.position)
    );
    clouds.follow(u, v, far * 2.2);

    // Stopped at the poles: nothing past them, as the 2D map shows nothing past its locked edges.
    water.pastThePoles(seen.v !== null);
    clouds.pastThePoles(seen.v !== null);
    overlayMaterial.clippingPlanes = seen.v === null ? poles : null;
    stopped = seen.v === null;

    // The copies of the world the haze doesn't hide: when they change, every chunk is drawn at the new ones. And the
    //  markers', nearer.
    const inSight = copiesNear(orbit.focus, far, seen),
      // What's laid past the poles is drawn round the world too when they're stopped at.
      key = `${inSight.join(';')}${stopped ? ' stopped' : ''}`,
      markersInSight = copiesNear(
        orbit.focus,
        Math.min(far, orbit.distance * 2.2),
        seen
      ),
      markersKey = markersInSight.join(';');

    if (key !== copiesKey) {
      copies = inSight;
      copiesKey = key;
      chunks.forEach((chunk) => {
        chunk.drawn.forEach((drawn) => land.remove(drawn));
        chunk.drawn = copiesOf(chunk, land);
      });
      overlays.forEach((overlay) => {
        overlay.drawn.forEach((drawn) => land.remove(drawn));
        overlay.drawn = overlayCopiesOf(overlay);
      });

      if (yieldsPlaced !== null) {
        yieldsPlaced.drawn.forEach((drawn) => yieldsGroup.remove(drawn));
        yieldsPlaced.drawn = copiesOf(yieldsPlaced, yieldsGroup);
      }
    }

    // The yields' icons are smaller, the lower the camera looks, so they still fit their squares.
    yields.lean(orbit.pitch);

    if (markersKey !== markerCopiesKey) {
      markerCopies = markersInSight;
      markerCopiesKey = markersKey;
      [...markers.values(), ...walkers.values()].forEach((marker) => {
        marker.drawn.forEach((drawn) => markersGroup.remove(drawn));
        marker.drawn = copiesOf(marker, markersGroup, markerCopies);
      });
      walkers.forEach(face);
      // Copies made afresh, from the kit's materials: those faded, faded again.
      walkers.forEach((walker) => {
        if (walker.opacity < 1) {
          fade(walker.drawn, walker.opacity, walker.faded);
        }
      });
    }
  };

  return {
    render: (): void => renderer.render(scene, camera),
    resize: (width, height, pixelRatio): void => {
      renderer.setPixelRatio(pixelRatio);
      // The canvas's own size only: the page's stylesheet sizes its box.
      renderer.setSize(width, height, false);
      camera.aspect = height > 0 ? width / height : 1;
      camera.updateProjectionMatrix();
    },
    setChunk: (i, j, mesh): void => {
      const key = `${i},${j}`,
        geometry = new BufferGeometry();

      geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
      geometry.setAttribute('color', new BufferAttribute(mesh.colours, 3));
      // How much of each surface the ground is, from 0 to 1.
      geometry.setAttribute(
        'surfacesA',
        new BufferAttribute(mesh.surfacesA, 4, true)
      );
      geometry.setAttribute(
        'surfacesB',
        new BufferAttribute(mesh.surfacesB, 4, true)
      );
      // How much of what the ground's blended from is water, for wet ground at the waterline.
      geometry.setAttribute('shore', new BufferAttribute(mesh.shore, 1, true));
      geometry.setIndex(new BufferAttribute(mesh.indices, 1));
      geometry.computeBoundingSphere();

      const old = chunks.get(key);

      if (old !== undefined) {
        old.drawn.forEach((drawn) => land.remove(drawn));
        old.geometry.dispose();
      }

      const chunk: Placed & { geometry: BufferGeometry } = {
        geometry,
        at: [mesh.u, 0, mesh.v],
        make: () => {
          const drawn = new Mesh(geometry, material);

          drawn.castShadow = true;
          drawn.receiveShadow = true;

          return drawn;
        },
        drawn: [],
      };

      chunk.drawn = copiesOf(chunk, land);
      chunks.set(key, chunk);
      water.setChunk(mesh);
    },
    setOverlay: (i, j, mesh): void => {
      const key = `${i},${j}`,
        old = overlays.get(key);

      if (old !== undefined) {
        old.drawn.forEach((drawn) => land.remove(drawn));
        old.geometry.dispose();
        overlays.delete(key);
      }

      if (mesh === null) {
        return;
      }

      const geometry = new BufferGeometry();

      geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
      geometry.setAttribute('color', new BufferAttribute(mesh.colours, 3));
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();

      const box = geometry.boundingBox,
        overlay: Placed & {
          geometry: BufferGeometry;
          span: [number, number];
        } = {
          geometry,
          // How far down the ground it reaches, from its top to its bottom.
          span: [mesh.v + (box?.min.z ?? 0), mesh.v + (box?.max.z ?? 0)],
          at: [mesh.u, 0, mesh.v],
          make: () => {
            const drawn = new Mesh(geometry, overlayMaterial);

            // Its specials, huts and mines cast shadows; what's laid flat takes the land's.
            drawn.castShadow = true;
            drawn.receiveShadow = true;

            return drawn;
          },
          drawn: [],
        };

      overlay.drawn = overlayCopiesOf(overlay);
      overlays.set(key, overlay);
    },
    setMarker: (key, at, marker): void => {
      // Its geometries and materials are the kit's, shared by every marker, and let go by the kit's sweep.
      markers.get(key)?.drawn.forEach((drawn) => markersGroup.remove(drawn));
      markers.delete(key);

      if (marker === null) {
        return;
      }

      const original = markerOf(marker),
        placed: Placed = {
          at,
          make: () => original.clone(),
          drawn: [],
          original,
        };

      placed.drawn = copiesOf(placed, markersGroup, markerCopies);
      markers.set(key, placed);
      sweep();
    },
    setWalker: (id, marker): void => {
      const old = walkers.get(id);

      old?.drawn.forEach((drawn) => markersGroup.remove(drawn));

      if (old !== undefined) {
        unfade(old.faded);
      }

      walkers.delete(id);

      if (marker === null) {
        return;
      }

      const original = markerOf(marker),
        walker: Placed & { facing: number; opacity: number; faded: Faded } = {
          at: old?.at ?? [0, 0, 0],
          facing: old?.facing ?? marker.unit?.facing ?? 0,
          opacity: 1,
          faded: new Map(),
          make: () => original.clone(),
          drawn: [],
          original,
        };

      walker.drawn = copiesOf(walker, markersGroup, markerCopies);
      face(walker);
      walkers.set(id, walker);
      sweep();
    },
    placeWalker: (id, at, facing): void => {
      const walker = walkers.get(id);

      if (walker === undefined) {
        return;
      }

      walker.at = at;
      walker.facing = facing;
      walker.drawn.forEach((drawn, copy) => {
        const [offsetU, offsetV] = markerCopies[copy] ?? [0, 0];

        drawn.position.set(at[0] + offsetU, at[1], at[2] + offsetV);
      });
      face(walker);
    },
    fadeWalker: (id, opacity): void => {
      const walker = walkers.get(id),
        solid = Math.min(1, Math.max(0, opacity));

      if (walker === undefined || solid === walker.opacity) {
        return;
      }

      walker.opacity = solid;
      fade(walker.drawn, solid, walker.faded);
    },
    setYields: (mesh): void => {
      yieldsPlaced?.drawn.forEach((drawn) => yieldsGroup.remove(drawn));
      yieldsPlaced = null;

      if (yields.set(mesh) === null) {
        return;
      }

      // The whole world's, from its origin.
      yieldsPlaced = { at: [0, 0, 0], make: () => yields.make(), drawn: [] };
      yieldsPlaced.drawn = copiesOf(yieldsPlaced, yieldsGroup);
    },
    view,
    stats: (): StageStats => ({
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
    }),
    dispose: (): void => {
      chunks.forEach(({ geometry }) => geometry.dispose());
      chunks.clear();
      overlays.forEach(({ geometry }) => geometry.dispose());
      overlays.clear();
      overlayMaterial.dispose();
      markers.clear();
      walkers.forEach(({ faded }) => unfade(faded));
      walkers.clear();
      kit.dispose();
      yields.dispose();
      water.dispose();
      clouds.dispose();
      material.dispose();
      detail.dispose();
      renderer.dispose();
    },
  };
};

export default createStage;
