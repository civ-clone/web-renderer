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
  Matrix3,
  Matrix4,
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
import {
  RiggedModel,
  SHOT_KINDS,
  readModelManifest,
} from '@civ-clone/ui-map-3d/models/modelSet';
import {
  LoadedModel,
  LoadedRig,
  clipsOf,
} from '@civ-clone/ui-map-3d/models/loadModels';
import {
  FIGURE_STAGGER,
  IDLE_SPREAD,
  LOOPED_ROLES,
  Playing,
  clipTime,
  idlePhase,
  poseFigures,
  rigFacts,
} from '@civ-clone/ui-map-3d/markers/clips';
import boundClips, { stretchOf } from '@civ-clone/ui-map-3d/markers/rigBounds';
import {
  IDLE_DISTANCE,
  IDLE_DISTANCE_OUT,
  IDLE_SWAPS,
  idleChanges,
  idleSquares,
} from '@civ-clone/ui-map-3d/idling';
import TintedMaterial, { ownerTint } from '@civ-clone/ui-map-3d/markers/tinted';
import { shotTimes } from '@civ-clone/ui-map-3d/shots';
import { copyOf, jointOf, letGoOfSkeletons } from '@civ-clone/ui-map-3d/stage';
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
      rigOf((json) => {
        json.models.partisan.rigged.clips = {};
        delete json.models.partisan.rigged.shots;
      }),
      rigOf((json) => {
        json.models.partisan.rigged.clips = { dance: 'x' };
        delete json.models.partisan.rigged.shots;
      }),
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
      // A shot of a kind the map doesn't draw.
      rigOf(
        (json) => (json.models.partisan.rigged.shots.fight[0].kind = 'laser')
      ),
    ],
    Array.from({ length: 16 }, () => 'dropped')
  );

  expect(
    'a shot says what it is, of the kinds the map draws',
    SHOT_KINDS.map((kind) =>
      rigOf((json) => (json.models.partisan.rigged.shots.fight[0].kind = kind))
    ).map((rigged) => (rigged as RiggedModel).shots?.fight?.[0]?.kind),
    [...SHOT_KINDS]
  );
}

// A rigged copy made here, as a set's file would load: a scene, posed as its model stands, whose two parts are bound
//  to one skeleton of two bones (the arm's the top half of a post), one part in its owner's colour; its walk turns the
//  arm a quarter and back over a second, and its fall tips the whole over a second and a half: not a whole number of
//  the walk's, so a walk left playing under it would show.
const rigged = (armature: Group | null = null): LoadedRig => {
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
  // Under an armature of its own, as some files have, scaled and moved: the skeleton and the parts with it.
  if (armature === null) {
    scene.add(hips, plain, owner);
  } else {
    armature.add(hips, plain, owner);
    scene.add(armature);
  }

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

// The clip each role plays, of those a rigged copy's file has, as its manifest names them (`clipsOf`): one its file
//  hasn't, or with a track moving a node it can't name, as GLTFLoader names one with none, refused, saying why. Its
//  shots leave nodes named as the file has them, found as three.js names them: one from a node it hasn't, refused.
{
  const made = rigged(),
    animations = [...made.clips.values()],
    entry = {
      file: 'models/rigged/partisan.glb',
      clips: { move: 'walk', die: 'fall' },
      shots: { move: [{ at: 0.25, joint: 'arm' }] },
    },
    tried = (
      change: (each: { animations: AnimationClip[]; entry: any }) => void
    ): unknown => {
      const each = {
        animations: animations.map((clip) => clip.clone()),
        entry: JSON.parse(JSON.stringify(entry)),
      };

      change(each);

      try {
        const { clips, shots } = clipsOf(
          { animations: each.animations, scene: made.scene },
          each.entry
        );

        return [
          [...clips].map(([role, clip]) => [role, clip.name]),
          [...shots],
        ];
      } catch (error) {
        return (error as Error).message;
      }
    };

  expect(
    'each role’s clip is the one its manifest names, with its shots, each leaving a node as three.js names it; one its file hasn’t, moving a node it can’t name, or shooting from a node it hasn’t, is refused',
    [
      tried(() => {}),
      tried(({ entry }) => (entry.shots.move[0].joint = 'ar.m')),
      tried(({ entry }) => (entry.shots.move[0].joint = 'hand')),
      tried(({ entry }) => (entry.clips.idle = 'stand')),
      tried(({ animations }) => {
        const [walk] = animations;

        walk!.tracks[0]!.name = `${made.scene.uuid}x.quaternion`;
      }),
    ],
    [
      [
        [
          ['move', 'walk'],
          ['die', 'fall'],
        ],
        [
          ['move', [{ at: 0.25, joint: 'arm' }]],
          ['die', []],
        ],
      ],
      [
        [
          ['move', 'walk'],
          ['die', 'fall'],
        ],
        [
          ['move', [{ at: 0.25, joint: 'arm' }]],
          ['die', []],
        ],
      ],
      "models/rigged/partisan.glb: clip walk shoots from a node it hasn't (hand)",
      'models/rigged/partisan.glb: no clip stand',
      `models/rigged/partisan.glb: clip walk moves a node it can't name (${made.scene.uuid}x.quaternion)`,
    ]
  );

  // What a shot is, as its manifest says, kept as it's read, loaded, told of a battle and timed.
  const read = readModelManifest({
      schema: 1,
      kind: 'models',
      id: 'bows',
      name: 'Bows',
      licence: {
        name: 'CC0 1.0',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      },
      credits: [
        {
          work: 'Archer',
          author: 'dom111',
          url: 'https://github.com/civ-clone/models-realistic-cc0',
          licence: {
            name: 'CC0 1.0',
            url: 'https://creativecommons.org/publicdomain/zero/1.0/',
          },
        },
      ],
      scale: 0.1,
      models: {
        archer: {
          file: 'models/archer.glb',
          rigged: {
            file: 'models/rigged/archer.glb',
            clips: { move: 'walk', die: 'fall' },
            shots: { move: [{ at: 0.25, joint: 'arm', kind: 'arrow' }] },
          },
        },
      },
      names: { unit: { Archers: 'archer' } },
    }),
    archer = typeof read === 'string' ? undefined : read.models.archer?.rigged,
    loaded =
      archer === undefined
        ? undefined
        : clipsOf(
            { animations: [...made.clips.values()], scene: made.scene },
            archer
          ),
    facts =
      loaded === undefined
        ? undefined
        : rigFacts({ ...made, clips: loaded.clips, shots: loaded.shots }, 2);

  expect(
    'what a shot is, as its manifest says, is kept as it’s read, loaded, told of a battle and timed',
    [
      archer?.shots?.move?.[0]?.kind,
      loaded?.shots.get('move')?.[0]?.kind,
      facts?.clips.move?.shots[0]?.kind,
      shotTimes(facts?.clips.move?.shots ?? [], 2, 0.1).map(({ kind }) => kind),
    ],
    ['arrow', 'arrow', 'arrow', ['arrow', 'arrow']]
  );
}

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
    'its parts are in its owner’s colour where they say, the same materials for every figure, drawn only where they’re seen, each with bounds of its own, the same as the others’',
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
      figures.every((figure, index) =>
        meshesOf(figure).every((mesh, part) => {
          const { boundingSphere, boundingBox } = mesh as SkinnedMesh,
            other = meshesOf(figures[(index + 1) % figures.length]!)[
              part
            ] as SkinnedMesh;

          return (
            mesh.frustumCulled &&
            boundingSphere !== null &&
            boundingBox !== null &&
            boundingSphere !== other.boundingSphere &&
            boundingSphere.equals(other.boundingSphere!) &&
            boundingBox !== other.boundingBox
          );
        })
      ),
    ],
    [true, true, true]
  );

  // Each part posed at every twentieth of a second of each clip, and as the model stands: where it reaches, in its own
  //  space, within its bounds, sphere and box. The fall lays the post flat, a post's length from where it stood, which
  //  its bounds as the model stands wouldn't cover.
  const posed = figures[1]!,
    parts = meshesOf(posed) as SkinnedMesh[],
    // How far past its sphere its furthest point lies, or 1 if one's outside its box, which a ray's tested against.
    reach = (each: SkinnedMesh): number => {
      const sphere = each.boundingSphere!,
        geometry = each.geometry,
        point = new Vector3();
      let furthest = 0;

      for (let i = 0; i < geometry.getAttribute('position').count; i++) {
        each.getVertexPosition(i, point);
        furthest = Math.max(
          furthest,
          point.distanceTo(sphere.center) - sphere.radius,
          each.boundingBox!.containsPoint(point) ? 0 : 1
        );
      }

      return furthest;
    },
    playing = new WeakMap<Object3D, Playing>(),
    outside: string[] = [];

  rig.clips.forEach((clip, role) => {
    for (let at = 0; at <= clip.duration; at += 0.05) {
      poseFigures(posed, rig, role, at, playing);
      posed.updateMatrixWorld(true);
      parts.forEach((each, index) => {
        if (reach(each) > 1e-6) {
          outside.push(`${role} ${round(at)} part ${index}`);
        }
      });
    }
  });

  poseFigures(posed, rig, 'die', 1.5, playing);
  posed.updateMatrixWorld(true);

  const lying = parts[0]!;

  // Its bounds as the model stands, as three.js would work them out.
  lying.geometry.computeBoundingSphere();

  const standingBounds = lying.geometry.boundingSphere!,
    pastStanding = (() => {
      const point = new Vector3();
      let furthest = 0;

      for (let i = 0; i < lying.geometry.getAttribute('position').count; i++) {
        lying.getVertexPosition(i, point);
        furthest = Math.max(
          furthest,
          point.distanceTo(standingBounds.center) - standingBounds.radius
        );
      }

      return furthest;
    })();

  poseFigures(posed, rig, null, 0, playing);

  expect(
    'its bounds cover every pose each of its clips takes it to, the fall laying it flat, past its bounds as it stands',
    [outside, round(pastStanding) > 0.5],
    [[], true]
  );

  // The model's own parts, made after the rig's: their own materials, not the rig's of the same part.
  const own = kit
    .modelFigures('partisan', look, colours)!
    .meshes.map(([, material]) => material as TintedMaterial);

  expect(
    'the model’s own parts are drawn with materials of their own, not its rigged copy’s',
    [own.length, own[0] === materials[0]![0], own[0]!.map],
    [1, false, null]
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

  // A clip played once, each figure a little behind the one before: one whose own time hasn't come plays what it was
  //  playing till it does, where it's told what; told nothing, it holds the clip's start. A clip that loops has no
  //  such wait.
  const roles = (
      role: 'die' | 'move',
      seconds: number,
      before?: { role: 'move' | 'die'; seconds: number }
    ) => {
      const playing = new WeakMap<Object3D, Playing>();

      poseFigures(asked, rig, role, seconds, playing, before);

      return asked
        .getObjectsByProperty('name', RIG_FIGURE)
        .map((figure) => playing.get(figure)?.role);
    },
    squad = formation(look.squad);

  expect(
    'in a clip played once, a figure whose own time hasn’t come plays what it was, where it’s told; told nothing, it holds the clip’s start; in one that loops, none waits',
    [
      roles('die', 0.1, { role: 'move', seconds: 0.3 }),
      roles('die', 0.1),
      roles('move', -0.2, { role: 'die', seconds: 0 }),
    ],
    [
      squad.map((_, index) =>
        0.1 - index * FIGURE_STAGGER < 0 ? 'move' : 'die'
      ),
      squad.map(() => 'die'),
      squad.map(() => 'move'),
    ]
  );

  // The same figures posed on, frame after frame: the second still walking, a little further on in its walk than the
  //  first would be, then falling once its own time in the fall has come, its walk stopped and its arm put back.
  const onward = new WeakMap<Object3D, Playing>(),
    second = asked.getObjectsByProperty('name', RIG_FIGURE)[1]!,
    bone = (name: string) => second.getObjectByName(name),
    part = (to: Quaternion, share: number) => still.clone().slerp(to, share);

  poseFigures(asked, rig, 'die', 0.1, onward, { role: 'move', seconds: 0.3 });

  const walking = [
    onward.get(second)?.role,
    turned(bone('arm'), part(quarter, (0.3 + FIGURE_STAGGER) / 0.5)),
  ];

  poseFigures(asked, rig, 'die', 0.3, onward, { role: 'move', seconds: 0.5 });

  expect(
    'posed on, a figure whose own time hasn’t come walks, as far on as it would; once it has, it falls as far in as its own time says, its walk stopped',
    [
      walking,
      onward.get(second)?.role,
      turned(bone('arm'), still),
      turned(bone('hips'), part(quarter, (0.3 - FIGURE_STAGGER) / 1.5)),
    ],
    [['move', true], 'die', true, true]
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

  // A fall, played once, half a second in, and a tenth: each figure after the first a little behind it, none ahead
  //  of the blow; one not yet falling stands as it was at the fall's start.
  const tipped = (seconds: number) =>
    figures.map((figure, index) =>
      turned(
        bonesOf(figure).get('hips'),
        new Quaternion().slerpQuaternions(
          still,
          quarter,
          Math.max(0, seconds - index * FIGURE_STAGGER) / 1.5
        )
      )
    );

  poseFigures(drawn, rig, 'die', 0.5, playing);

  const halfASecond = tipped(0.5);

  poseFigures(drawn, rig, 'die', 0.1, playing);

  expect(
    'a fall, played once: each figure after the first a little behind it, half a second in and a tenth, and none ahead',
    [figures.length, halfASecond, tipped(0.1)],
    [3, [true, true, true], [true, true, true]]
  );
}

// What a rigged copy plays, as a battle's paced for it (`rigFacts`): each clip's length and shots, by role, and how
//  many figures, how far apart.
expect(
  'what a rigged copy plays: each role’s clip, how long, and its shots; and its figures, how far apart in a clip',
  rigFacts(
    {
      ...rig,
      shots: new Map([['die', [{ at: 0.2, joint: 'arm' }]]]),
    },
    3
  ),
  {
    figures: 3,
    stagger: FIGURE_STAGGER,
    clips: {
      move: { duration: 1, shots: [] },
      die: { duration: 1.5, shots: [{ at: 0.2, joint: 'arm' }] },
    },
  }
);

// A walker's copies, one for each copy of the world in sight (`copyOf`): drawn with a rigged copy, each with bones of
//  its own, so posing one leaves the others standing; a plain copy's would be bound to the original's. And let go of,
//  each skeleton's texture of its bones with it.
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

// Where a figure's node is as it's posed, as a shot leaves it (`jointOf`): on the world's own copy, from the copy of the
//  world it's drawn at; moved as its clip moves it; each figure's its own; and nothing for a node or figure it hasn't.
{
  const drawn = copyOf(
      drawMarker(
        kit,
        { city: null, unit: unit('Spearman', { model: 'partisan' }) },
        true,
        true
      ),
      true
    )(),
    playing = new WeakMap<Object3D, Playing>(),
    figure = drawn.getObjectsByProperty('name', RIG_FIGURE)[0]!,
    // The arm's a figure's height over its hips, at its scale.
    reach = figure.scale.y;

  drawn.position.set(5 + 8, 0.1, 7);

  const standing = jointOf(drawn, 0, 'arm', [8, 0])!,
    unmoved = jointOf(drawn, 0, 'arm', [0, 0])!;

  poseFigures(drawn, rig, 'die', 10, playing);

  const fallen = jointOf(drawn, 0, 'arm', [8, 0])!,
    rounded = (point: readonly number[]) =>
      point.map((n) => Math.round(n * 1e6) / 1e6);

  expect(
    'a figure’s node, as a shot leaves it: on the world’s own copy, moved as its clip moves it, each figure’s its own; none for a node or figure it hasn’t',
    [
      Math.abs(standing[0] - 5) < 0.3 && Math.abs(standing[2] - 7) < 0.3,
      rounded([unmoved[0] - 8, unmoved[1], unmoved[2]]),
      Math.round(((standing[1] - fallen[1]) / reach) * 1000) / 1000,
      rounded(jointOf(drawn, 1, 'arm', [8, 0])!).join() !==
        rounded(fallen).join(),
      jointOf(drawn, 0, 'muzzle', [8, 0]),
      jointOf(drawn, 9, 'arm', [8, 0]),
      jointOf(undefined, 0, 'arm', [8, 0]),
    ],
    [true, rounded(standing), 1, true, null, null, null]
  );
}

// Let go of with its model: added again, the model's rigged copy goes, with what it's made of.
const rigGeometries = meshesOf(rig.scene).map(({ geometry }) => geometry),
  rigTextures = meshesOf(rig.scene)
    .map(({ material }) => (material as MeshStandardMaterial).map)
    .filter((map): map is Texture => map !== null),
  geometriesGone = new Set<unknown>();

[...rigGeometries, ...rigTextures].forEach((each) =>
  each.addEventListener('dispose', () => geometriesGone.add(each))
);
kit.addModel('partisan', { ...model, parts: [...model.parts] });

expect(
  'a model let go of takes its rigged copy with it, and what that’s made of',
  [
    kit.rigOf('partisan'),
    kit.rigFigures('partisan', look, colours),
    rigGeometries.every((geometry) => geometriesGone.has(geometry)),
    rigTextures.length > 0 &&
      rigTextures.every((texture) => geometriesGone.has(texture)),
  ],
  [null, null, true, true]
);

// A rig under an armature scaled and moved, as some files have it: its bounds are in each part's own space, so cover
//  every pose its clips take it to there too.
{
  const armature = new Group();

  armature.scale.setScalar(3);
  armature.position.set(2, 1, -4);

  const moved = rigged(armature);

  boundClips(moved);

  const parts = meshesOf(moved.scene) as SkinnedMesh[],
    playing = new WeakMap<Object3D, Playing>(),
    point = new Vector3(),
    outside: string[] = [];

  moved.clips.forEach((clip, role) => {
    for (let at = 0; at <= clip.duration; at += 0.05) {
      poseFigures(moved.scene, moved, role, at, playing);
      moved.scene.updateMatrixWorld(true);
      parts.forEach((each, index) => {
        const sphere = each.boundingSphere!;

        for (let i = 0; i < each.geometry.getAttribute('position').count; i++) {
          each.getVertexPosition(i, point);

          if (
            point.distanceTo(sphere.center) > sphere.radius + 1e-6 ||
            !each.boundingBox!.containsPoint(point)
          ) {
            outside.push(`${role} ${round(at)} part ${index}`);

            break;
          }
        }
      });
    }
  });

  expect(
    'under an armature scaled and moved, its bounds cover every pose its clips take it to',
    [[...new Set(outside)], parts.length],
    [[], 2]
  );
}

// How far a bone's move stretches anything, at most: exactly as far as its longest axis, turned and grown; sheared, as a
//  stretched bone's turned child is, no less than the most it stretches anything, which its longest axis can be.
{
  const turned = new Quaternion().setFromAxisAngle(
      new Vector3(1, 2, 3).normalize(),
      0.7
    ),
    grown = new Matrix4().compose(
      new Vector3(1, 2, 3),
      turned,
      new Vector3(2, 2, 2)
    ),
    stretched = new Matrix4().compose(
      new Vector3(),
      turned,
      new Vector3(1, 4, 1)
    ),
    sheared = new Matrix4()
      .makeScale(1, 4, 1)
      .multiply(new Matrix4().makeRotationZ(Math.PI / 4)),
    // The most it stretches any of many ways, a fine sweep round.
    most = (matrix: Matrix4): number => {
      let found = 0;

      for (let a = 0; a < 64; a++) {
        for (let b = 0; b < 32; b++) {
          const way = new Vector3().setFromSphericalCoords(
            1,
            (b / 31) * Math.PI,
            (a / 64) * Math.PI * 2
          );

          found = Math.max(
            found,
            way.applyMatrix3(new Matrix3().setFromMatrix4(matrix)).length()
          );
        }
      }

      return found;
    };

  expect(
    'a bone turned and grown stretches as far as its longest axis; sheared, never less than it does',
    [
      round(stretchOf(grown)),
      round(stretchOf(stretched)),
      stretchOf(sheared) >= most(sheared) - 1e-6,
      sheared.getMaxScaleOnAxis() < most(sheared) - 0.1,
    ],
    [2, 4, true, true]
  );
}

// Which stacks idle: those near the camera, with it close in, on the screen or nearly, those idling going on a little
//  further; a few start at a time, one fading left as it is; each its own way into its clip.
{
  // A world 40 squares across that repeats, its squares a unit apart, and every square on the screen but those whose
  //  `x` is past the margin asked about, as a screen 10 squares wide round the focus would have them.
  const centre = (x: number, y: number): [number, number] => [x + 0.5, y + 0.5],
    period = { u: 40, v: null },
    seenFrom =
      (focusX: number) =>
      (x: number, _y: number, margin: number): boolean => {
        const apart = Math.abs(((x - focusX + 60) % 40) - 20);

        return apart <= 5 - margin;
      },
    near = (
      squares: string[],
      distance: number,
      was: string[] = [],
      focusX = 10
    ): string[] =>
      [
        ...idleSquares(
          squares,
          { distance, focus: [focusX + 0.5, 10.5] },
          centre,
          period,
          new Set(was),
          seenFrom(focusX)
        ),
      ].sort();

  expect(
    'with the camera close in, those within its reach of its focus idle, the short way round the world: not those further, nor off the screen',
    [
      near(['10,10', '15,10', '10,18', '10,19', '17,10', '1,10'], 5),
      near(['38,10', '2,10'], 5, [], 0),
    ],
    [
      ['10,10', '10,18', '15,10'],
      ['2,10', '38,10'],
    ]
  );

  expect(
    'those idling go on further, and further off the screen',
    [
      near(['10,20', '17,10'], 5, ['10,20', '17,10']),
      near(['10,21', '18,10'], 5, ['10,21', '18,10']),
    ],
    [['10,20', '17,10'], []]
  );

  expect(
    'with the camera drawn back, none start idling; those idling stop once it’s drawn back further',
    [
      near(['10,10'], IDLE_DISTANCE),
      near(['10,10'], IDLE_DISTANCE + 0.5),
      near(['10,10'], IDLE_DISTANCE_OUT, ['10,10']),
      near(['10,10'], IDLE_DISTANCE_OUT + 0.5, ['10,10']),
    ],
    [['10,10'], [], ['10,10'], []]
  );

  const changes = (
      keys: string[],
      idling: string[],
      cannot: string[] = [],
      fading: string[] = []
    ) =>
      idleChanges(
        new Set(keys),
        new Set(idling),
        (key) => !cannot.includes(key),
        (key) => fading.includes(key)
      ),
    many = ['1,1', '2,1', '3,1', '4,1', '5,1', '6,1'];

  expect(
    'those asked start, those no longer asked stand, those idling go on; one that can’t idle, or fading, is left as it is; a few start at a time, the rest waiting',
    [
      changes(
        ['1,1', '2,1', '3,1', '6,1'],
        ['2,1', '4,1', '5,1'],
        ['3,1'],
        ['5,1', '6,1']
      ),
      changes(many, []),
      changes(many, many.slice(0, IDLE_SWAPS)),
    ],
    [
      { stand: ['4,1'], start: ['1,1'], waiting: false },
      { stand: [], start: many.slice(0, IDLE_SWAPS), waiting: true },
      { stand: [], start: many.slice(IDLE_SWAPS), waiting: false },
    ]
  );

  const phases = ['0,0', '1,0', '0,1', '12,34', '99,99'].map(idlePhase);

  expect(
    'each stack is its own way into its clip, the same each time',
    [
      phases.every((phase) => phase >= 0 && phase < IDLE_SPREAD),
      new Set(phases.map(round)).size,
      idlePhase('12,34') === phases[3],
    ],
    [true, phases.length, true]
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL clips3d: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS clips3d (${checks} checks)\n`);
