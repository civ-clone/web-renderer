// Clips on the 3D map (plan 2.2), without a GPU:
//  - a model's rigged copy in a set's manifest, read and checked: its file beside the manifest, the clip each role
//    plays, and the shots each lets fly; a clip for a role the map doesn't play left out; one it can't play dropped,
//    its model and the rest of the set kept;
//  - the marker kit draws a unit's figures with its model's rigged copy where it's asked to, as many and where its
//    model's would be, each with a skeleton of its own, in its owner's colour where its parts say, drawn however far a
//    clip takes it; with none, or not asked, as before;
//  - each figure posed as a role's clip has it a time in, by the clock: round and round for one that loops, held at
//    its end for one that doesn't, a squad's figures a little apart; with no clip, standing as the model does;
//  - a walker's copies, one for each copy of the world, each with bones of its own, and let go of with their bones'
//    textures; and a rigged copy let go of with its model.

import {
  AnimationClip,
  Bone,
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  Texture,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import {
  FIGURES_PART,
  MarkerKit,
  RIG_FIGURE,
  drawMarker,
} from '@civ-clone/ui-map-3d/markers/drawMarker';
import { readModelManifest } from '@civ-clone/ui-map-3d/models/modelSet';
import { LoadedModel, LoadedRig } from '@civ-clone/ui-map-3d/models/loadModels';
import {
  FIGURE_STAGGER,
  LOOPED_ROLES,
  Playing,
  clipTime,
  poseFigures,
} from '@civ-clone/ui-map-3d/markers/clips';
import TintedMaterial, { ownerTint } from '@civ-clone/ui-map-3d/markers/tinted';
import { copyOf, letGoOfSkeletons } from '@civ-clone/ui-map-3d/stage';
import { UnitMarker } from '@civ-clone/ui-map-3d/markers/markerFor';
import { formation } from '@civ-clone/ui-map-3d/markers/figures';
import { unitTable } from '@civ-clone/ui-models-builtin/units';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

const round = (value: number) => Math.round(value * 10000) / 10000,
  quarter = new Quaternion().setFromAxisAngle(
    new Vector3(0, 0, 1),
    Math.PI / 2
  ),
  still = new Quaternion();

// A model's rigged copy in a manifest, and what's dropped.
{
  const manifest = (): Record<string, any> => ({
      schema: 1,
      kind: 'models',
      id: 'realistic',
      name: 'Realistic units',
      licence: {
        name: 'CC0 1.0',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      },
      credits: [
        {
          work: 'Partisan',
          author: 'dom111',
          url: 'https://github.com/civ-clone/models-realistic-cc0',
          licence: {
            name: 'CC0 1.0',
            url: 'https://creativecommons.org/publicdomain/zero/1.0/',
          },
        },
      ],
      scale: 0.09,
      models: {
        partisan: {
          file: 'models/partisan.glb',
          rigged: {
            file: 'models/rigged/partisan.glb',
            sha256: 'aa',
            clips: { idle: 'idle', move: 'walk', fight: 'throw', die: 'die' },
            shots: { fight: [{ at: 0.5, joint: 'prop' }] },
          },
        },
      },
      names: { unit: { Partisans: 'partisan' } },
    }),
    // The model's rigged copy as the manifest's read with `change` made to it: or that it's dropped, the model kept.
    rigOf = (change: (json: Record<string, any>) => void): unknown => {
      const json = manifest();

      change(json);

      const result = readModelManifest(json);

      return typeof result === 'string'
        ? result
        : result.models.partisan?.rigged ??
            (result.models.partisan === undefined ? 'no model' : 'dropped');
    };

  expect(
    'a model’s rigged copy is read with it: its file, the clip each role plays, and the shots each lets fly; a clip for a role the map doesn’t play is left out',
    [
      rigOf(() => {}),
      rigOf((json) => delete json.models.partisan.rigged.shots),
      rigOf((json) => {
        json.models.partisan.rigged.clips.sink = 'sink';
        json.models.partisan.rigged.shots.sink = [{ at: 1, joint: 'hull' }];
      }),
    ],
    [
      {
        file: 'models/rigged/partisan.glb',
        clips: { idle: 'idle', move: 'walk', fight: 'throw', die: 'die' },
        shots: { fight: [{ at: 0.5, joint: 'prop' }] },
      },
      {
        file: 'models/rigged/partisan.glb',
        clips: { idle: 'idle', move: 'walk', fight: 'throw', die: 'die' },
      },
      {
        file: 'models/rigged/partisan.glb',
        clips: { idle: 'idle', move: 'walk', fight: 'throw', die: 'die' },
        shots: { fight: [{ at: 0.5, joint: 'prop' }] },
      },
    ]
  );

  expect(
    'a rigged copy the map can’t play is dropped, its model drawn as it stands, and the rest of the set read',
    [
      rigOf((json) => (json.models.partisan.rigged = null)),
      rigOf((json) => (json.models.partisan.rigged = 'partisan.glb')),
      rigOf((json) => (json.models.partisan.rigged.file = '../partisan.glb')),
      rigOf((json) => (json.models.partisan.rigged.file = 'rigged.gltf')),
      rigOf(
        (json) =>
          (json.models.partisan.rigged.file = 'https://elsewhere/partisan.glb')
      ),
      rigOf((json) => delete json.models.partisan.rigged.clips),
      rigOf((json) => (json.models.partisan.rigged.clips = {})),
      rigOf((json) => (json.models.partisan.rigged.clips = { dance: 'x' })),
      rigOf((json) => (json.models.partisan.rigged.clips.idle = '')),
      rigOf((json) => (json.models.partisan.rigged.shots = [])),
      rigOf((json) => (json.models.partisan.rigged.shots.fight = {})),
      rigOf((json) => (json.models.partisan.rigged.shots.fight[0].at = -1)),
      rigOf(
        (json) => (json.models.partisan.rigged.shots.fight[0].at = Number.NaN)
      ),
      rigOf((json) => (json.models.partisan.rigged.shots.fight[0].joint = '')),
      // Shots in a role it names no clip for.
      rigOf((json) => delete json.models.partisan.rigged.clips.fight),
    ],
    Array.from({ length: 15 }, () => 'dropped')
  );
}

// A rigged copy made here, as a set's file would load: a scene, posed as its model stands, whose two parts are bound
//  to one skeleton of two bones (the arm's the top half of a post), one part in its owner's colour; its walk turns the
//  arm a quarter and back over a second, and its fall tips the whole over a second and a half: not a whole number of
//  the walk's, so a walk left playing under it would show.
const rigged = (): LoadedRig => {
  const scene = new Group(),
    hips = new Bone(),
    arm = new Bone(),
    part = (material: MeshStandardMaterial): SkinnedMesh => {
      const geometry = new BoxGeometry(0.2, 2, 0.2, 1, 2, 1).translate(0, 1, 0),
        position = geometry.getAttribute('position'),
        indices: number[] = [],
        weights: number[] = [];

      for (let i = 0; i < position.count; i++) {
        indices.push(position.getY(i) > 1.01 ? 1 : 0, 0, 0, 0);
        weights.push(1, 0, 0, 0);
      }

      geometry.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4));
      geometry.setAttribute(
        'skinWeight',
        new Float32BufferAttribute(weights, 4)
      );

      return new SkinnedMesh(geometry, material);
    },
    plain = part(new MeshStandardMaterial({ map: new Texture() })),
    owner = part(new MeshStandardMaterial());

  (owner.material as MeshStandardMaterial).userData.playerColour = true;
  hips.name = 'hips';
  arm.name = 'arm';
  arm.position.set(0, 1, 0);
  hips.add(arm);
  scene.add(hips, plain, owner);
  scene.updateMatrixWorld(true);

  const skeleton = new Skeleton([hips, arm]);

  plain.bind(skeleton);
  owner.bind(skeleton);

  return {
    scene,
    clips: new Map([
      [
        'move',
        new AnimationClip('walk', 1, [
          new QuaternionKeyframeTrack(
            'arm.quaternion',
            [0, 0.5, 1],
            [...still.toArray(), ...quarter.toArray(), ...still.toArray()]
          ),
        ]),
      ],
      [
        'die',
        new AnimationClip('fall', 1.5, [
          new QuaternionKeyframeTrack(
            'hips.quaternion',
            [0, 1.5],
            [...still.toArray(), ...quarter.toArray()]
          ),
        ]),
      ],
    ]),
    shots: new Map(),
    scale: 0.1,
  };
};

const colours: [string, string] = ['#2060c0', '#ffffff'],
  model: LoadedModel = {
    parts: [
      {
        geometry: new BoxGeometry(0.2, 2, 0.2),
        map: null,
        tinted: false,
        cutout: false,
        doubleSided: false,
      },
    ],
    scale: 0.1,
  },
  unit = (type: string, more: Partial<UnitMarker> = {}): UnitMarker => ({
    id: `Unit-${type}`,
    type,
    kinds: [],
    colours,
    count: 1,
    active: false,
    busy: false,
    fortified: false,
    veteran: false,
    health: null,
    status: null,
    facing: 0,
    size: 1,
    ...more,
  }),
  meshesOf = (object: Object3D): Mesh[] => {
    const found: Mesh[] = [];

    object.traverse((each) => {
      if ((each as Mesh).isMesh) {
        found.push(each as Mesh);
      }
    });

    return found;
  },
  bonesOf = (figure: Object3D): Map<string, Object3D> =>
    new Map(
      ['hips', 'arm'].map((name) => [name, figure.getObjectByName(name)!])
    ),
  // As turned as `to`, but for what a clip's keys lose kept as 32-bit floats.
  turned = (bone: Object3D | undefined, to: Quaternion) =>
    bone !== undefined && bone.quaternion.angleTo(to) < 1e-3;

// The kit: a rigged copy added only after its model, drawn as many and where its model's figures would be.
const kit = new MarkerKit(),
  rig = rigged(),
  look = unitTable['Spearman']!;

kit.addRig('partisan', rig);

const before = kit.rigOf('partisan');

kit.addModel('partisan', model);
kit.addRig('partisan', rig);

{
  const figures = kit.rigFigures('partisan', look, colours, 1.5)!,
    squad = formation(look.squad),
    skeletons = figures.map((figure) =>
      meshesOf(figure).map((mesh) => (mesh as SkinnedMesh).skeleton)
    );

  expect(
    'a rigged copy is added only after its model; its figures are as many as its model’s, where they stand, as big',
    [
      before,
      kit.rigOf('partisan') === rig,
      figures.length,
      figures.map(({ name }) => name === RIG_FIGURE),
      figures.map(({ position }) => [round(position.x), round(position.z)]),
      figures.every(({ position }) => position.y > 0),
      figures.map(({ scale }) => round(scale.x)),
    ],
    [
      null,
      true,
      squad.length,
      squad.map(() => true),
      squad.map(([x, z]) => [round(x * 1.5), round(z * 1.5)]),
      true,
      squad.map(() => round(0.1 * 1.5)),
    ]
  );

  expect(
    'each figure has a skeleton of its own, its parts bound to its own bones, not the copy’s nor another figure’s',
    [
      skeletons.every(
        (each, index) =>
          each.length === 2 &&
          each[0]!.bones.length === 2 &&
          each[0]!.bones.every((bone, at) => each[1]!.bones[at] === bone) &&
          each[0]!.bones.every(
            (bone) => figures[index]!.getObjectById(bone.id) === bone
          )
      ),
      new Set(skeletons.map(([each]) => each!.bones[0])).size,
      skeletons.some(([each]) =>
        each!.bones.some((bone) => rig.scene.getObjectById(bone.id) === bone)
      ),
    ],
    [true, figures.length, false]
  );

  const materials = figures.map((figure) =>
    meshesOf(figure).map((mesh) => mesh.material as TintedMaterial)
  );

  expect(
    'its parts are in its owner’s colour where they say, the same materials for every figure, drawn however far a clip takes them',
    [
      materials.every(
        ([plain, owner]) =>
          plain instanceof TintedMaterial &&
          owner instanceof TintedMaterial &&
          plain.tint.equals(new Color(1, 1, 1)) &&
          owner.tint.equals(ownerTint(colours[0])) &&
          plain.map ===
            ((rig.scene.children[1] as Mesh).material as MeshStandardMaterial)
              .map
      ),
      materials.every(
        ([plain, owner]) =>
          plain === materials[0]![0] && owner === materials[0]![1]
      ),
      figures.every((figure) =>
        meshesOf(figure).every(({ frustumCulled }) => !frustumCulled)
      ),
    ],
    [true, true, true]
  );

  expect(
    'a model with no rigged copy has no rigged figures',
    [kit.rigOf('statue'), kit.rigFigures('statue', look, colours)],
    [null, null]
  );
}

// A marker drawn to play a clip draws its unit's figures with its model's rigged copy; drawn otherwise, as before.
{
  const asked = drawMarker(
      kit,
      { city: null, unit: unit('Spearman', { model: 'partisan' }) },
      true,
      true
    ).getObjectByName(FIGURES_PART)!,
    notAsked = drawMarker(
      kit,
      { city: null, unit: unit('Spearman', { model: 'partisan' }) },
      true
    ).getObjectByName(FIGURES_PART)!;

  expect(
    'a marker drawn to play a clip has its model’s rigged figures; one drawn otherwise, its model’s merged parts',
    [
      asked.children.map(({ name }) => name),
      notAsked.children.some(({ name }) => name === RIG_FIGURE),
      notAsked.children.length,
    ],
    [formation(look.squad).map(() => RIG_FIGURE), false, model.parts.length]
  );
}

// How far into a clip it is: round and round for a role that loops, held at its end for one that doesn't.
expect(
  'idle, move and work loop round; the rest are held just short of their end, and nothing is before its start',
  [
    LOOPED_ROLES,
    round(clipTime('move', 1, 2.25)),
    round(clipTime('idle', 3, 7.5)),
    round(clipTime('die', 2, 5)),
    round(clipTime('fight', 1.5, 0.5)),
    clipTime('move', 1, -3),
    clipTime('die', 0, 3),
  ],
  [['idle', 'move', 'work'], 0.25, 1.5, round(2 - 1e-4), 0.5, 0, 0]
);

// Each figure posed as its clip has it, by the clock, a squad's a little apart; with no clip, as its model stands.
{
  const figures = kit.rigFigures('partisan', look, colours)!,
    drawn = new Group(),
    playing = new WeakMap<Object3D, Playing>();

  figures.forEach((figure) => drawn.add(figure));

  // The walk half a second in: the first figure's arm a quarter turned; the next, a little further, turning back.
  poseFigures(drawn, rig, 'move', 0.5, playing);

  const walking = figures.map((figure) => bonesOf(figure).get('arm')!),
    expected = (seconds: number) =>
      new Quaternion().slerpQuaternions(
        seconds <= 0.5 ? still : quarter,
        seconds <= 0.5 ? quarter : still,
        seconds <= 0.5 ? seconds / 0.5 : (seconds - 0.5) / 0.5
      );

  expect(
    'walking half a second in, the first figure’s arm is turned a quarter, and each after it further on in the walk',
    walking.map((arm, index) =>
      turned(arm, expected((0.5 + index * FIGURE_STAGGER) % 1))
    ),
    walking.map(() => true)
  );

  // Two and a half seconds in: round again, as half a second in.
  poseFigures(drawn, rig, 'move', 2.5, playing);

  const again = turned(bonesOf(figures[0]!).get('arm'), quarter);

  // Falling, long after it's over: held tipped over, its arm as it stands.
  poseFigures(drawn, rig, 'die', 10, playing);

  const fallen = [
    turned(bonesOf(figures[0]!).get('hips'), quarter),
    turned(bonesOf(figures[0]!).get('arm'), still),
  ];

  // A role it has no clip for, then none: standing as the model does.
  poseFigures(drawn, rig, 'fight', 1, playing);

  const unplayed = figures.map((figure) =>
    [...bonesOf(figure).values()].every((bone) => turned(bone, still))
  );

  poseFigures(drawn, rig, 'move', 0.5, playing);
  poseFigures(drawn, rig, null, 0, playing);

  const standing = figures.map((figure) =>
    [...bonesOf(figure).values()].every((bone) => turned(bone, still))
  );

  expect(
    'a walk loops round; a fall is held at its end; a role with no clip, or none, stands each figure as the model does',
    [again, fallen, unplayed, standing],
    [true, [true, true], figures.map(() => true), figures.map(() => true)]
  );
}

// A walker's copies, one for each copy of the world in sight (`copyOf`): drawn with a rigged copy, each with bones of its
//  own, so posing one leaves the others standing; a plain copy's would be bound to the original's. And let go of, each
//  skeleton's texture of its bones with it.
{
  const original = drawMarker(
      kit,
      { city: null, unit: unit('Spearman', { model: 'partisan' }) },
      true,
      true
    ),
    [first, second] = [copyOf(original, true)(), copyOf(original, true)()],
    plain = copyOf(original, false)(),
    playing = new WeakMap<Object3D, Playing>(),
    skinnedIn = (copy: Object3D) =>
      meshesOf(copy).filter(
        (mesh): mesh is SkinnedMesh => (mesh as SkinnedMesh).isSkinnedMesh
      ),
    bonesIn = (copy: Object3D) =>
      skinnedIn(copy).flatMap((mesh) => mesh.skeleton.bones),
    ownBones = (copy: Object3D) =>
      bonesIn(copy).every((bone) => copy.getObjectById(bone.id) === bone);

  poseFigures(first!, rig, 'move', 0.5, playing);

  const armOf = (copy: Object3D) =>
      copy.getObjectsByProperty('name', RIG_FIGURE)[0]!.getObjectByName('arm'),
    textures = skinnedIn(second!).map(({ skeleton }) => {
      skeleton.computeBoneTexture();

      return skeleton.boneTexture!;
    }),
    disposed = new Set<unknown>();

  textures.forEach((texture) =>
    texture.addEventListener('dispose', () => disposed.add(texture))
  );
  letGoOfSkeletons(second!);

  expect(
    'a walker drawn with a rigged copy is copied with bones of its own for each copy of the world, posed alone; a plain copy shares the original’s; let go of, each skeleton’s texture goes',
    [
      ownBones(first!),
      ownBones(second!),
      bonesIn(first!).some((bone) => bonesIn(second!).includes(bone)),
      turned(armOf(first!), quarter),
      turned(armOf(second!), still),
      ownBones(plain),
      textures.length > 0 && textures.every((texture) => disposed.has(texture)),
    ],
    [true, true, false, true, true, false, true]
  );
}

// Let go of with its model: added again, the model's rigged copy goes, with what it's made of.
const rigGeometries = meshesOf(rig.scene).map(({ geometry }) => geometry),
  geometriesGone = new Set<unknown>();

rigGeometries.forEach((geometry) =>
  geometry.addEventListener('dispose', () => geometriesGone.add(geometry))
);
kit.addModel('partisan', { ...model, parts: [...model.parts] });

expect(
  'a model let go of takes its rigged copy with it, and what that’s made of',
  [
    kit.rigOf('partisan'),
    kit.rigFigures('partisan', look, colours),
    rigGeometries.every((geometry) => geometriesGone.has(geometry)),
  ],
  [null, null, true]
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL clips3d: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS clips3d (${checks} checks)\n`);
