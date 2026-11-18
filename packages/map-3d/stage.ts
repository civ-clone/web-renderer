// What three.js draws (docs/3d-renderer.md §9): for now an empty, lit scene, ground under a sky, lit by the sun and the
//  sky's light, where the land comes in slice 1.1. Kept apart from the view, which tests stand a stage of their own in
//  for: a test has no GPU to draw with.

import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from 'three';

/** Draws the scene on a canvas. */
export interface Stage {
  render(): void;
  /** The canvas's box in the page's px, and how many of the screen's pixels one is. */
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

export type StageFactory = (canvas: HTMLCanvasElement) => Stage;

// A muted palette (D2): an overcast sky, and ground the colour of dry grass.
const SKY = 0x9fb3c4,
  SKY_LIGHT = 0xd6e2ec,
  GROUND_LIGHT = 0x5b5140,
  SUN = 0xfff0d8,
  GROUND = 0x6f7552;

export const createStage: StageFactory = (canvas) => {
  const renderer = new WebGLRenderer({ antialias: true, canvas }),
    scene = new Scene(),
    camera = new PerspectiveCamera(40, 1, 0.1, 1000),
    ground = new PlaneGeometry(400, 400),
    groundMaterial = new MeshStandardMaterial({
      color: GROUND,
      roughness: 0.95,
    }),
    sun = new DirectionalLight(SUN, 2.4);

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;

  scene.background = new Color(SKY);
  // Haze into the distance (§9.3), so the ground meets the sky rather than ending at an edge.
  scene.fog = new Fog(SKY, 60, 240);
  scene.add(new HemisphereLight(SKY_LIGHT, GROUND_LIGHT, 0.8));

  // High in the south-east, lighting the land from the front right, as its relief will be lit (slice 1.1).
  sun.position.set(40, 60, 30);
  scene.add(sun);

  const groundMesh = new Mesh(ground, groundMaterial);

  groundMesh.rotation.x = -Math.PI / 2;
  scene.add(groundMesh);

  // Above the ground and back from it, looking down at it with the horizon at the top of the view.
  camera.position.set(0, 20, 60);
  camera.lookAt(0, 0, 0);

  return {
    render: (): void => renderer.render(scene, camera),
    resize: (width, height, pixelRatio): void => {
      renderer.setPixelRatio(pixelRatio);
      // The canvas's own size only: the page's stylesheet sizes its box.
      renderer.setSize(width, height, false);
      camera.aspect = height > 0 ? width / height : 1;
      camera.updateProjectionMatrix();
    },
    dispose: (): void => {
      ground.dispose();
      groundMaterial.dispose();
      renderer.dispose();
    },
  };
};

export default createStage;
