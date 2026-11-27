// Sets of models on the 3D map (docs/3d-renderer.md §10, plan 2.2), without a GPU:
//  - a set's manifest, read and checked: its licence and credits, its scale, each model's file beside it, and each unit
//    type drawn by one of its models; anything else refused, saying why;
//  - which model draws each unit type, and how big each is drawn;
//  - the page asks for a set to try out by its path on the site (`?models=`), and no other site's;
//  - a unit's marker says the model it's drawn with, where the map has one loaded for its type;
//  - the marker kit draws a unit with a model added: a mesh for each of its parts, as many figures as stand for one
//    unit merged in each, at the set's size times the player's, on the built-in set's stand (a ship on the water, in
//    its ripples at sea); in its owner's colour where its parts say (a very dark one lightened, so the model's shading
//    shows), cut out where they're see-through, from both sides where its file says, a material made once for each;
//    and the built-in set's figures till the model's added;
//  - an aircraft drawn with a model flies over its stand, as high as the built-in set's do;
//  - faded, a part keeps its owner's colour;
//  - the kit lets go of its models when taken down.

import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Sprite,
  Texture,
} from 'three';
import {
  AIRBORNE_LIFT,
  FIGURES_PART,
  FIRES_FROM,
  Faded,
  MarkerKit,
  drawMarker,
  fade,
  unfade,
} from '@civ-clone/ui-map-3d/markers/drawMarker';
import {
  ModelManifest,
  plantsOf,
  readModelManifest,
  scaleOf,
  unitTypesOf,
} from '@civ-clone/ui-map-3d/models/modelSet';
import {
  LoadedModel,
  modelKey,
  modelManager,
  onSite,
  partsOf,
  selfContained,
} from '@civ-clone/ui-map-3d/models/loadModels';
import TintedMaterial, {
  TINT_FLOOR,
  ownerTint,
} from '@civ-clone/ui-map-3d/markers/tinted';
import markerFor, { UnitMarker } from '@civ-clone/ui-map-3d/markers/markerFor';
import { formation } from '@civ-clone/ui-map-3d/markers/figures';
import { map3dModelsAsked } from '@civ-clone/ui-client/lib/map3dOptions';
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

// Labels and the pointer are drawn on canvases: a context that measures every letter as 10 px and draws nothing.
Object.assign(globalThis, {
  document: {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        measureText: (text: string) => ({ width: text.length * 10 }),
        beginPath: () => undefined,
        roundRect: () => undefined,
        fill: () => undefined,
        fillText: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        closePath: () => undefined,
        stroke: () => undefined,
      }),
    }),
  },
});

// A set as the 0 A.D. set's repository writes one.
const manifest = (): Record<string, unknown> => ({
    schema: 1,
    kind: 'models',
    id: '0ad-ancient',
    name: '0 A.D.: ancient units',
    source: 'hosted',
    licence: {
      name: 'CC BY-SA 3.0',
      url: 'https://creativecommons.org/licenses/by-sa/3.0/',
      attribution: 'Adapted from 0 A.D. by Wildfire Games',
    },
    credits: [
      {
        work: '0 A.D.',
        author: 'Wildfire Games',
        url: 'https://www.wildfiregames.com/',
        licence: {
          name: 'CC BY-SA 3.0',
          url: 'https://creativecommons.org/licenses/by-sa/3.0/',
        },
        from: 'https://gitea.wildfiregames.com/0ad/0ad at e63c5718',
      },
    ],
    scale: 0.039,
    models: {
      hoplite: { file: 'models/hoplite.glb', sha256: 'aa', extent: {} },
      trireme: { file: 'models/trireme.glb', scale: 0.0067 },
      spare: { file: 'models/spare.glb' },
    },
    names: {
      unit: { Spearman: 'hoplite', Phalanx: 'hoplite', Trireme: 'trireme' },
    },
  }),
  // The manifest with `change` made to it.
  read = (change: (json: Record<string, any>) => void): string => {
    const json = manifest();

    change(json);

    const result = readModelManifest(json);

    return typeof result === 'string' ? result : 'read';
  };

{
  const read0 = readModelManifest(manifest()) as ModelManifest;

  expect(
    'a set as its repository writes one is read: which model draws each type, by the model, and how big each is drawn',
    [
      typeof read0,
      [...unitTypesOf(read0)],
      scaleOf(read0, 'hoplite'),
      scaleOf(read0, 'trireme'),
    ],
    [
      'object',
      [
        ['hoplite', ['Spearman', 'Phalanx']],
        ['trireme', ['Trireme']],
      ],
      0.039,
      0.0067,
    ]
  );

  expect(
    'anything else is refused, saying why',
    [
      readModelManifest(null),
      readModelManifest([]),
      read((json) => (json.schema = 2)),
      read((json) => (json.kind = 'tileset')),
      read((json) => delete json.id),
      read((json) => (json.name = '')),
      read((json) => delete json.licence),
      read((json) => (json.licence = { name: 'CC0' })),
      read((json) => (json.licence.attribution = '')),
      read((json) => (json.credits = [])),
      read((json) => delete json.credits[0].url),
      read((json) => delete json.credits[0].licence),
      read((json) => (json.scale = 0)),
      read((json) => (json.scale = -1)),
      read((json) => (json.scale = Number.NaN)),
      read((json) => (json.scale = '0.039')),
      read((json) => (json.models = [])),
      read((json) => (json.models.spare.scale = 0)),
      read((json) => delete json.names),
      read((json) => (json.names = { unit: [] })),
      read((json) => (json.names.unit.Archer = 'archer')),
      read((json) => (json.names.unit.Archer = '')),
    ],
    [
      'not an object',
      'not an object',
      'not a set of models (schema 1)',
      'not a set of models (schema 1)',
      'no id or name',
      'no id or name',
      'no licence',
      'no licence',
      'no licence',
      'no credits',
      'no credits',
      'no credits',
      'no scale',
      'no scale',
      'no scale',
      'no scale',
      'no models',
      'model spare: no glTF binary beside the manifest, or no scale',
      'no unit names',
      'no unit names',
      'unit Archer: drawn by a model the set hasn’t',
      'unit Archer: drawn by a model the set hasn’t',
    ].map((reason) => reason.replace('’', "'"))
  );

  // The plants a set's models draw (#1335): by kind, or a kind on a terrain of its own, read by the model; none for a
  //  set that names none. A plant drawn by a model the set hasn't, or named as no kind is, is refused.
  const withPlants = (plants: unknown) => {
    const json = manifest();

    (json.names as Record<string, unknown>).plant = plants;

    return readModelManifest(json);
  };

  expect(
    'a set may say which plants its models draw, by kind or by kind on a terrain, read by the model',
    [
      [
        ...plantsOf(
          withPlants({
            conifer: 'spare',
            'Jungle:broadleaf': 'spare',
            palm: 'trireme',
          }) as ModelManifest
        ),
      ],
      [...plantsOf(read0)],
    ],
    [
      [
        ['spare', ['conifer', 'Jungle:broadleaf']],
        ['trireme', ['palm']],
      ],
      [],
    ]
  );
  expect(
    'a plant drawn by a model the set hasn’t, or named as no plant is, or plants not named one by one, is refused',
    [
      withPlants({ conifer: 'pine' }),
      withPlants({ conifer: '' }),
      withPlants({ 'conifer tree': 'spare' }),
      withPlants({ 'Jungle:': 'spare' }),
      withPlants({ ':broadleaf': 'spare' }),
      withPlants({ tree: 'spare' }),
      withPlants({ 'Jungle:Broadleaf': 'spare' }),
      withPlants(['spare']),
      withPlants('spare'),
    ],
    [
      'plant conifer: not a kind of plant, or drawn by a model the set hasn’t',
      'plant conifer: not a kind of plant, or drawn by a model the set hasn’t',
      'plant conifer tree: not a kind of plant, or drawn by a model the set hasn’t',
      'plant Jungle:: not a kind of plant, or drawn by a model the set hasn’t',
      'plant :broadleaf: not a kind of plant, or drawn by a model the set hasn’t',
      'plant tree: not a kind of plant, or drawn by a model the set hasn’t',
      'plant Jungle:Broadleaf: not a kind of plant, or drawn by a model the set hasn’t',
      'plant names not a list of plants',
      'plant names not a list of plants',
    ].map((reason) => reason.replace('’', "'"))
  );

  // A model's file must be beside the manifest: not another site's, the site's root, nor above where the set is.
  const files = [
    'models/hoplite.glb',
    'hoplite.glb',
    '/models/hoplite.glb',
    '../hoplite.glb',
    'models/../../hoplite.glb',
    'models/./hoplite.glb',
    'models//hoplite.glb',
    'https://example.com/hoplite.glb',
    'data:model/gltf-binary;base64,AAAA',
    'models\\hoplite.glb',
    '',
    // Not a glTF binary, which reads nothing more.
    'models/hoplite.gltf',
    'models/hoplite',
    // What a URL reads as other than it says: an escaped dot, a query, a fragment, a tab, a space.
    '%2e%2e/hoplite.glb',
    'models/%2e/hoplite.glb',
    'hoplite.glb?v=1',
    'hoplite.glb#mesh',
    'models/\thoplite.glb',
    'models/ hoplite.glb',
  ];

  expect(
    'a model’s file is a path beside the manifest, and nothing else',
    files.map(
      (file) => read((json) => (json.models.hoplite.file = file)) === 'read'
    ),
    [true, true, ...Array(17).fill(false)]
  );
}

// The page asks for a set by its path on this site, to try one out: never another site's.
expect(
  'the page asks for a set by its path on this site, and for none otherwise',
  [
    map3dModelsAsked('?3d=1&models=/sets/0ad/manifest.json'),
    map3dModelsAsked('?3d=1'),
    map3dModelsAsked('?models='),
    map3dModelsAsked('?models=sets/manifest.json'),
    map3dModelsAsked('?models=//example.com/manifest.json'),
    map3dModelsAsked('?models=/\\example.com/manifest.json'),
    map3dModelsAsked('?models=https://example.com/manifest.json'),
    map3dModelsAsked('?models=/sets\\..\\manifest.json'),
    // Read as the browser reads it: a tab, a newline or a return the browser drops from a URL, or a space.
    map3dModelsAsked('?models=/%09/example.com/manifest.json'),
    map3dModelsAsked('?models=/%0a/example.com/manifest.json'),
    map3dModelsAsked('?models=/%0d/example.com/manifest.json'),
    map3dModelsAsked('?models=/%20/example.com/manifest.json'),
    // Its dots taken out, leaving `//`, which the browser reads as another site's.
    map3dModelsAsked('?models=/.//example.com/manifest.json'),
    map3dModelsAsked('?models=/a/..//example.com/manifest.json'),
    map3dModelsAsked('?models=/..//example.com/manifest.json'),
    map3dModelsAsked('?models=/%2e//example.com/manifest.json'),
    map3dModelsAsked('?models=/a/%2e%2e//example.com/manifest.json'),
    // As it reads, its dots taken out.
    map3dModelsAsked('?models=/sets/x/../0ad/manifest.json'),
  ],
  [
    { url: '/sets/0ad/manifest.json' },
    ...Array(16).fill(undefined),
    { url: '/sets/0ad/manifest.json' },
  ]
);

// Whatever asked for it, the loader fetches nothing from another site, and loads only glTF binaries whole in
//  themselves.
{
  const here = 'https://site.test/play/',
    binary = (json: object, magic = 0x46546c67): ArrayBuffer => {
      const text = new TextEncoder().encode(JSON.stringify(json)),
        data = new ArrayBuffer(20 + text.length),
        view = new DataView(data);

      view.setUint32(0, magic, true);
      view.setUint32(4, 2, true);
      view.setUint32(8, data.byteLength, true);
      view.setUint32(12, text.length, true);
      view.setUint32(16, 0x4e4f534a, true);
      new Uint8Array(data, 20).set(text);

      return data;
    },
    // A glTF binary of a harmless JSON chunk and then one reading from elsewhere, which three.js reads last.
    twoJson = (): ArrayBuffer => {
      const first = new TextEncoder().encode(
          JSON.stringify({ buffers: [{ byteLength: 4 }] }).padEnd(32, ' ')
        ),
        second = new TextEncoder().encode(
          JSON.stringify({
            buffers: [{ byteLength: 4, uri: 'https://example.com/x.bin' }],
          }).padEnd(64, ' ')
        ),
        data = new ArrayBuffer(12 + 8 + first.length + 8 + second.length),
        view = new DataView(data);

      view.setUint32(0, 0x46546c67, true);
      view.setUint32(4, 2, true);
      view.setUint32(8, data.byteLength, true);
      view.setUint32(12, first.length, true);
      view.setUint32(16, 0x4e4f534a, true);
      new Uint8Array(data, 20).set(first);
      view.setUint32(20 + first.length, second.length, true);
      view.setUint32(24 + first.length, 0x4e4f534a, true);
      new Uint8Array(data, 28 + first.length).set(second);

      return data;
    },
    // One that says it's longer than it is.
    longer = (): ArrayBuffer => {
      const data = binary({ buffers: [{ byteLength: 4 }] });

      new DataView(data).setUint32(8, data.byteLength + 8, true);

      return data;
    };

  expect(
    'the loader takes this site’s addresses and no other’s',
    [
      onSite('/sets/0ad/manifest.json', here),
      onSite('models/hoplite.glb', 'https://site.test/sets/0ad/manifest.json'),
      onSite('//example.com/manifest.json', here),
      onSite('https://example.com/manifest.json', here),
      onSite('/.//example.com/manifest.json', here),
      onSite('http://site.test/sets/manifest.json', here),
    ],
    [
      'https://site.test/sets/0ad/manifest.json',
      'https://site.test/sets/0ad/models/hoplite.glb',
      null,
      null,
      'https://site.test//example.com/manifest.json',
      null,
    ]
  );

  expect(
    'two sets’ models named the same are kept apart, each set’s by its own key',
    [
      modelKey('/sets/0ad.json', 'cannon') ===
        modelKey('/sets/0ad.json', 'cannon'),
      modelKey('/sets/0ad.json', 'cannon') ===
        modelKey('/sets/later.json', 'cannon'),
    ],
    [true, false]
  );

  expect(
    'and loads a glTF binary only if it’s whole in itself, reading nothing from elsewhere',
    [
      selfContained(
        binary({ buffers: [{ byteLength: 4 }], images: [{ bufferView: 0 }] })
      ),
      selfContained(
        binary({
          buffers: [{ byteLength: 4, uri: 'https://example.com/x.bin' }],
        })
      ),
      selfContained(
        binary({ buffers: [{ byteLength: 4 }], images: [{ uri: 'x.png' }] })
      ),
      selfContained(binary({ buffers: [{ byteLength: 4 }] }, 0x12345678)),
      selfContained(new ArrayBuffer(8)),
      // Lists as objects keyed by their places, which three.js reads as lists.
      selfContained(
        binary({
          buffers: { 0: { byteLength: 4, uri: 'https://example.com/x.bin' } },
        })
      ),
      selfContained(
        binary({
          buffers: [{ byteLength: 4 }],
          images: { 0: { uri: 'x.png' } },
        })
      ),
      selfContained(binary({ buffers: { 0: { byteLength: 4 } } })),
      // A `uri` anywhere, and extensions, which may read more.
      selfContained(
        binary({
          buffers: [{ byteLength: 4 }],
          materials: [{ extras: { uri: 'x.png' } }],
        })
      ),
      selfContained(
        binary({
          buffers: [{ byteLength: 4 }],
          extensionsUsed: ['KHR_texture_basisu'],
        })
      ),
      selfContained(
        binary({
          buffers: [{ byteLength: 4 }],
          extensionsRequired: ['EXT_meshopt_compression'],
        })
      ),
      selfContained(binary([])),
      // A second JSON chunk, which three.js would read instead; more than it says it is; and less.
      selfContained(twoJson()),
      selfContained(longer()),
      selfContained(binary({ buffers: [{ byteLength: 4 }] }).slice(0, 24)),
    ],
    [true, ...Array(14).fill(false)]
  );

  // Whatever a model's file says, what it's loaded with fetches nothing but what's in the file itself.
  const manager = modelManager('https://site.test'),
    resolved = (url: string): string => {
      try {
        return manager.resolveURL(url);
      } catch {
        return 'refused';
      }
    };

  expect(
    'a model’s loaded with nothing but what’s in its file: no other address, on this site or another',
    [
      resolved('blob:https://site.test/1234'),
      resolved('data:image/png;base64,AAAA'),
      resolved('blob:https://example.com/1234'),
      resolved('https://example.com/x.bin'),
      resolved('/sets/0ad/x.bin'),
      resolved('x.bin'),
      resolved(''),
    ],
    [
      'blob:https://site.test/1234',
      'data:image/png;base64,AAAA',
      'refused',
      'refused',
      'refused',
      'refused',
      'refused',
    ]
  );
}

// A unit's marker says the model it's drawn with, where the map has one for its type.
{
  const tile = (type: string) => ({
      city: null,
      units: [
        {
          id: `Unit-${type}`,
          _: type,
          __: [],
          player: { civilization: { attributes: [] } },
          improvements: [],
          busy: null,
        },
      ],
    }),
    models = new Map([['Spearman', 'hoplite']]),
    modelOf = (type: string): string | null => models.get(type) ?? null,
    marked = (type: string, of?: (type: string) => string | null) =>
      markerFor(
        tile(type) as unknown as Parameters<typeof markerFor>[0],
        null,
        true,
        {},
        () => 0,
        1,
        of
      )?.unit;

  expect(
    'a unit’s marker says the model it’s drawn with where the map has one for its type, and says none otherwise',
    [
      marked('Spearman', modelOf)?.model,
      'model' in (marked('Archer', modelOf) ?? {}),
      'model' in (marked('Spearman') ?? {}),
    ],
    ['hoplite', false, false]
  );
}

// The kit: a model added, and units drawn with it.
const colours = ['#aa0000', '#ffffff'] as const,
  others = ['#0000aa', '#ffff00'] as const,
  // A box a unit high, standing on its origin, as a set's model stands.
  box = (height: number): BufferGeometry => {
    const geometry = new BoxGeometry(0.5, height, 0.5);

    geometry.translate(0, height / 2, 0);

    return geometry;
  },
  disposed: string[] = [],
  watched = <T extends { dispose(): void }>(name: string, thing: T): T => {
    const dispose = thing.dispose.bind(thing);

    thing.dispose = () => {
      disposed.push(name);
      dispose();
    };

    return thing;
  },
  // A model of two parts: a solid one in its owner's colour, and a see-through one, a unit high, drawn a tenth that.
  model: LoadedModel = {
    parts: [
      {
        geometry: watched('solid geometry', box(1)),
        map: watched('solid map', new Texture()),
        tinted: true,
        cutout: false,
        doubleSided: true,
      },
      {
        geometry: watched('see-through geometry', box(0.5)),
        map: watched('see-through map', new Texture()),
        tinted: false,
        cutout: true,
        doubleSided: true,
      },
    ],
    scale: 0.1,
  },
  plain: LoadedModel = {
    parts: [
      {
        geometry: box(1),
        map: new Texture(),
        tinted: false,
        cutout: false,
        doubleSided: false,
      },
    ],
    scale: 0.2,
  },
  kit = new MarkerKit(),
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
  figuresOf = (group: Object3D): Object3D | undefined =>
    group.getObjectByName(FIGURES_PART),
  meshesOf = (object: Object3D | undefined): Mesh[] => {
    const found: Mesh[] = [];

    object?.traverse((each) => {
      if (each instanceof Mesh) {
        found.push(each);
      }
    });

    return found;
  },
  round = (value: number) => Math.round(value * 10000) / 10000;

// Before it's added: the built-in set's figures.
{
  const before = figuresOf(
    drawMarker(kit, {
      city: null,
      unit: unit('Spearman', { model: 'hoplite' }),
    })
  );

  expect(
    'a unit whose model isn’t added yet is drawn with the built-in set’s figures',
    [
      before instanceof Mesh,
      (before as Mesh | undefined)?.material === kit.figureMaterial,
      kit.modelFigures('hoplite', unitTable['Spearman']!, colours),
    ],
    [true, true, null]
  );
}

kit.addModel('hoplite', model);
kit.addModel('statue', plain);

// Archers drawn with a model loose their arrows from in front of each figure, as far in front of it as the model's
//  meshes reach in front of the one furthest forward, six tenths up them (`firePoints`): from the model's meshes, not
//  the built-in set's figures. Spearmen with it fire nothing.
{
  const look = unitTable['Archer']!,
    figures = kit.modelFigures('hoplite', look, colours)!,
    box = new Box3(),
    kept = (type: string) =>
      figuresOf(
        drawMarker(kit, { city: null, unit: unit(type, { model: 'hoplite' }) })
      )?.userData[FIRES_FROM] as number[][] | undefined;

  figures.meshes.forEach(([geometry]) => {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
  });

  const squad = formation(look.squad),
    front = Math.max(...squad.map(([, z]) => z));

  expect(
    'archers drawn with a model loose an arrow each, from in front of each figure, as far as the model reaches, six tenths up; spearmen with it fire nothing',
    [kept('Archer')?.map((point) => point.map(round)), kept('Spearman')],
    [
      squad.map(([x, z]) =>
        [
          x,
          box.min.y + (box.max.y - box.min.y) * 0.6,
          z + box.max.z - front,
        ].map(round)
      ),
      undefined,
    ]
  );
}

// A squad: as many figures as stand for one unit, merged in each part's mesh, on the built-in set's stand.
{
  const look = unitTable['Spearman']!,
    figures = kit.modelFigures('hoplite', look, colours)!,
    squad = formation(look.squad),
    [solid, seeThrough] = figures.meshes,
    count = (geometry: BufferGeometry) =>
      geometry.getAttribute('position').count,
    group = drawMarker(kit, {
      city: null,
      unit: unit('Spearman', { model: 'hoplite', facing: 0.5 }),
    }),
    drawn = figuresOf(group)!,
    meshes = meshesOf(drawn),
    standing = meshesOf(group).filter((mesh) => !meshes.includes(mesh)),
    // Its flag, and all that stands over it, where it's put.
    flown: number[] = [];

  group.traverse((object) => {
    if (object instanceof Sprite) {
      flown.push(round(object.position.y));
    }
  });

  solid![0].computeBoundingBox();

  const bounds = solid![0].boundingBox!;

  expect(
    'a squad drawn with a model: a mesh for each of its parts, the squad’s figures merged in each, at the set’s size, standing on the stand where the squad stands',
    [
      figures.meshes.length,
      count(solid![0]) / count(model.parts[0]!.geometry),
      count(seeThrough![0]) / count(model.parts[1]!.geometry),
      round(bounds.min.y),
      round(bounds.max.y),
      round(figures.top),
      round(bounds.min.x),
      round(bounds.max.x),
    ],
    [
      2,
      squad.length,
      squad.length,
      0.03,
      0.13,
      0.13,
      round(Math.min(...squad.map(([x]) => x)) - 0.025),
      round(Math.max(...squad.map(([x]) => x)) + 0.025),
    ]
  );

  expect(
    'drawn: its figures a part of their own, turned the way it faces, a mesh for each of the model’s parts; on the built-in set’s stand; its flag over what the model reaches',
    [
      drawn instanceof Group,
      drawn.rotation.y,
      meshes.map(
        (mesh) => mesh.geometry === figures.meshes[meshes.indexOf(mesh)]![0]
      ),
      standing.some((mesh) => mesh.material === kit.figureMaterial),
      flown.length > 0 && flown.every((y) => y === round(figures.top + 0.04)),
    ],
    [true, 0.5, [true, true], true, true]
  );

  const [solidMaterial, seeThroughMaterial] = figures.meshes.map(
    ([, material]) => material
  ) as [TintedMaterial, MeshStandardMaterial];

  expect(
    'in its owner’s colour where its part says, from both sides as its file says, and cut out, both sides drawn, where it’s see-through, each with its texture',
    [
      solidMaterial instanceof TintedMaterial,
      solidMaterial.tint.getHexString(),
      solidMaterial.side === DoubleSide,
      solidMaterial.map === model.parts[0]!.map,
      seeThroughMaterial instanceof TintedMaterial,
      seeThroughMaterial.alphaTest,
      seeThroughMaterial.side === DoubleSide,
      seeThroughMaterial.map === model.parts[1]!.map,
    ],
    [
      true,
      new Color(colours[0]).getHexString(),
      true,
      true,
      false,
      0.5,
      true,
      true,
    ]
  );

  const again = kit.modelFigures('hoplite', look, colours)!,
    otherColours = kit.modelFigures('hoplite', look, others)!,
    bigger = kit.modelFigures('hoplite', look, colours, 1.5)!,
    // A type of one figure, drawn with the same model.
    alone = kit.modelFigures('hoplite', unitTable['Settlers']!, colours)!;

  bigger.meshes[0]![0].computeBoundingBox();

  expect(
    'made once for each: the same again; in other colours, the same figures, its tinted part’s material in theirs, its see-through one the same; bigger as the player chooses; a single figure for one that isn’t a squad',
    [
      again === figures,
      otherColours.meshes.every(
        ([geometry], index) => geometry === figures.meshes[index]![0]
      ),
      otherColours.meshes[0]![1] !== solidMaterial,
      (otherColours.meshes[0]![1] as TintedMaterial).tint.getHexString(),
      otherColours.meshes[1]![1] === seeThroughMaterial,
      round(bigger.meshes[0]![0].boundingBox!.max.y),
      count(alone.meshes[0]![0]) / count(model.parts[0]!.geometry),
    ],
    [
      true,
      true,
      true,
      // Too dark to show its shading as it is: lightened.
      ownerTint(others[0]).getHexString(),
      true,
      round(0.03 + 0.15),
      1,
    ]
  );

  // A part with no owner's colour: in a material whose colour mixes in white, so as its texture is.
  const statue = kit.modelFigures('statue', unitTable['Settlers']!, colours)!,
    statueOthers = kit.modelFigures('statue', unitTable['Settlers']!, others)!;

  expect(
    'a part with no owner’s colour is as its texture is, in one material for every owner; one whose file doesn’t say it’s drawn from both sides is drawn from its front',
    [
      (statue.meshes[0]![1] as TintedMaterial).tint.getHexString(),
      statue.meshes[0]![1] === statueOthers.meshes[0]![1],
      statue.meshes[0]![1].side === FrontSide,
    ],
    ['ffffff', true, true]
  );
}

// An owner's colour painted on a model: as it is, unless it's too dark to show the model's shading, when it's mixed
//  with white just enough, its hue kept.
{
  const luminance = (colour: Color): number =>
      0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b,
    black = ownerTint('#000000'),
    blue = ownerTint('#0000aa'),
    darkRed = ownerTint('#aa0000');

  expect(
    'a very dark owner’s colour is lightened on a model, just enough, its hue kept; one light enough is as it is',
    [
      round(luminance(black)),
      black.r === black.g && black.g === black.b,
      round(luminance(blue)),
      blue.b > blue.r && blue.r === blue.g,
      darkRed.getHexString(),
      ownerTint('#ffcc00').getHexString(),
    ],
    [round(TINT_FLOOR), true, round(TINT_FLOOR), true, 'aa0000', 'ffcc00']
  );
}

// What's read of a model's file: each mesh's part, drawn from both sides where its material says so.
{
  const scene = new Group(),
    material = (side: typeof DoubleSide | typeof FrontSide) =>
      new MeshStandardMaterial({ side, map: new Texture() });

  scene.add(new Mesh(box(1), material(DoubleSide)));
  scene.add(new Mesh(box(1), material(FrontSide)));

  expect(
    'a model’s part is drawn from both sides where its file’s material says so, and from its front otherwise',
    partsOf(scene).map((part) => part.doubleSided),
    [true, false]
  );
}

// An aircraft drawn with a model: flying over its stand, its underside as high as the built-in set's aircraft's, at any
//  size; a vehicle drawn with the same model, on its stand.
{
  const lowest = (figures: ReturnType<MarkerKit['modelFigures']>): number => {
      const geometry = figures!.meshes[0]![0];

      geometry.computeBoundingBox();

      return round(geometry.boundingBox!.min.y);
    },
    builtIn = kit.body(unitTable['Fighter']!, colours, false, 2, 'figures');

  builtIn.computeBoundingBox();

  expect(
    'an aircraft drawn with a model flies over its stand, as high as the built-in set’s, at any size; a vehicle drawn with it stands on its stand',
    [
      lowest(kit.modelFigures('statue', unitTable['Fighter']!, colours)),
      lowest(kit.modelFigures('statue', unitTable['Fighter']!, colours, 2)),
      Math.abs(
        lowest(kit.modelFigures('statue', unitTable['Fighter']!, colours, 2)) -
          builtIn.boundingBox!.min.y
      ) < 0.001,
      lowest(kit.modelFigures('statue', unitTable['Tank']!, colours, 2)),
    ],
    [round(0.03 + AIRBORNE_LIFT), round(0.03 + 2 * AIRBORNE_LIFT), true, 0.03]
  );
}

// A ship: on the water, with no stand, in its ripples out at sea.
{
  const look = unitTable['Trireme']!,
    figures = kit.modelFigures('statue', look, colours)!,
    atSea = drawMarker(kit, {
      city: null,
      unit: unit('Trireme', { model: 'statue' }),
    }),
    inPort = drawMarker(
      kit,
      { city: null, unit: unit('Trireme', { model: 'statue' }), inCity: true },
      false
    ),
    others = (group: Group) =>
      meshesOf(group).filter(
        (mesh) =>
          !meshesOf(figuresOf(group)).includes(mesh) &&
          mesh.material === kit.figureMaterial
      );

  figures.meshes[0]![0].computeBoundingBox();

  expect(
    'a ship drawn with a model sits on the water, with no stand: in its ripples at sea, and nothing under it in port',
    [
      round(figures.meshes[0]![0].boundingBox!.min.y),
      others(atSea).length,
      others(inPort).length,
    ],
    [0, 1, 0]
  );
}

// Faded, as a unit arriving or falling is: its parts' materials its own, its owner's colour kept.
{
  const group = drawMarker(kit, {
      city: null,
      unit: unit('Spearman', { model: 'hoplite' }),
    }),
    faded: Faded = new Map(),
    [solidMesh] = meshesOf(figuresOf(group));

  fade([group], 0.5, faded);

  const own = solidMesh!.material as Material;

  expect(
    'faded, a model’s part keeps its owner’s colour in a material of its own',
    [
      own instanceof TintedMaterial,
      (own as TintedMaterial).tint.getHexString(),
      own.alphaHash,
      own.opacity,
      own !==
        kit.modelFigures('hoplite', unitTable['Spearman']!, colours)!
          .meshes[0]![1],
    ],
    [true, new Color(colours[0]).getHexString(), true, 0.5, true]
  );
  unfade(faded);
}

// The owner's colour mixed in where the texture's alpha says, in the shader three.js compiles.
{
  const material = new TintedMaterial({ tint: new Color('#ff0000') }),
    shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      fragmentShader: 'void main() {\n#include <map_fragment>\n}',
    };

  material.onBeforeCompile(shader as never);

  expect(
    'the owner’s colour is a uniform, mixed in by the texture’s alpha, and the alpha isn’t how solid it is',
    [
      shader.uniforms.tint?.value === material.tint,
      shader.fragmentShader.startsWith('uniform vec3 tint;'),
      shader.fragmentShader.includes(
        'diffuseColor.rgb *= texel.rgb * mix( tint, vec3( 1.0 ), texel.a );'
      ),
      shader.fragmentShader.includes('#include <map_fragment>'),
      shader.fragmentShader.includes('diffuseColor.a'),
      material.clone().tint.getHexString(),
    ],
    [true, true, true, false, false, 'ff0000']
  );
}

// A model added again under the same id: the one before let go of, with all that was made from it, and the new one drawn.
{
  const before = kit.modelFigures('statue', unitTable['Settlers']!, colours)!,
    gone: string[] = [],
    replacement: LoadedModel = {
      parts: [
        {
          geometry: box(2),
          map: new Texture(),
          tinted: false,
          cutout: false,
          doubleSided: false,
        },
      ],
      scale: 0.2,
    };

  watched('statue geometry', plain.parts[0]!.geometry);
  watched('statue made', before.meshes[0]![0]);
  watched('statue material', before.meshes[0]![1]);
  disposed.length = 0;
  kit.addModel('statue', replacement);

  const after = kit.modelFigures('statue', unitTable['Settlers']!, colours)!;

  after.meshes[0]![0].computeBoundingBox();
  gone.push(...disposed.splice(0));

  expect(
    'a model added again under its id lets go of the one before and all made from it, and is drawn itself',
    [
      ['statue geometry', 'statue made', 'statue material'].every((name) =>
        gone.includes(name)
      ),
      after === before,
      round(after.meshes[0]![0].boundingBox!.max.y),
    ],
    [true, false, round(0.03 + 0.4)]
  );
}

// Taken down: the kit lets go of its models, their textures, and what it made from them.
{
  const made = kit.modelFigures('hoplite', unitTable['Spearman']!, colours)!;

  watched('made geometry', made.meshes[0]![0]);
  watched('made material', made.meshes[0]![1]);
  kit.dispose();

  expect(
    'taken down, the kit lets go of its models, their textures, and what it made of them',
    [
      'solid geometry',
      'solid map',
      'see-through geometry',
      'see-through map',
      'made geometry',
      'made material',
    ].map((name) => disposed.includes(name)),
    [true, true, true, true, true, true]
  );
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL models3d: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS models3d (${checks} checks)\n`);
