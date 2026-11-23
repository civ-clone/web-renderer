// A set of models that ships with civ.one (docs/3d-renderer.md §10, `tools/lib/hostedSets.js`): its models copied
//  beside the page under names with its manifest's hash in them, each as the manifest's SHA-256 says it is, and its
//  manifest naming them so, which the 3D map reads and loads as it does any set's; the set's files from before removed,
//  and nothing else; a model missing, not beside its manifest, or not the file it says, failing the build. The sets the
//  renderer declares, 0 A.D.'s ancient units and the two sets of realistic ones, are built as the suite's runner builds
//  them, and the page asks for them under `?3d=1`, unless it asked for another.

import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { readModelManifest } from '@civ-clone/ui-map-3d/models/modelSet';
import { selfContained } from '@civ-clone/ui-map-3d/models/loadModels';
import { unitTable } from '@civ-clone/ui-models-builtin/units';
import hostedModelSets, {
  ancientUnits,
  creditedUnits,
  realisticUnits,
} from '@civ-clone/ui-models-hosted';

const { buildHostedModels, buildModelSet, declaredModelSets } =
  require('../../tools/lib/hostedSets') as {
    buildHostedModels: (root: string) => object;
    buildModelSet: (
      manifest: string,
      output: string
    ) => { manifest: string; name: string; licence: object; credits: object[] };
    declaredModelSets: (
      root?: string
    ) => { directory: string; manifest: string }[];
  };

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

// The renderer's root: the suite runs there, bundled elsewhere.
const root = process.cwd();

const sha256 = (bytes: Buffer | string): string =>
    createHash('sha256').update(bytes).digest('hex'),
  shipped = require.resolve('@civ-clone/models-0ad/manifest.json', {
    paths: [root],
  }),
  shippedText = readFileSync(shipped),
  source = JSON.parse(shippedText.toString()) as {
    id: string;
    models: { [name: string]: { file: string; sha256: string } };
    names: { unit: { [type: string]: string } };
  },
  hash = sha256(shippedText).slice(0, 12),
  output = mkdtempSync(join(tmpdir(), 'hosted-models-'));

// Beside it, the realistic units: those made for civ.one (CC0), then those adapted from their authors' (CC BY).
const realistic = (
  ['models-realistic-cc0', 'models-realistic-by'] as const
).map((name) => {
  const path = require.resolve(`@civ-clone/${name}/manifest.json`, {
      paths: [root],
    }),
    text = readFileSync(path);

  return {
    name,
    path,
    text,
    source: JSON.parse(text.toString()) as typeof source & {
      credits: object[];
    },
  };
});

// The renderer's own sets, declared by the package that ships them, 0 A.D.'s first.
expect(
  'the renderer declares 0 A.D.’s ancient units, then the realistic units made for civ.one, then those adapted from their authors’, from the package that ships them',
  declaredModelSets(root).map(({ directory, manifest }) => [
    directory.split(/[\\/]/).slice(-2).join('/'),
    manifest === shipped
      ? 'ancient'
      : realistic.find(({ path }) => path === manifest)?.name ?? manifest,
  ]),
  [
    ['packages/models-hosted', 'ancient'],
    ['packages/models-hosted', 'models-realistic-cc0'],
    ['packages/models-hosted', 'models-realistic-by'],
  ]
);

// Beside it, from before: the set's own, built from another manifest, and files that are no one's to remove.
writeFileSync(join(output, `${source.id}.000000000000.json`), '{}');
writeFileSync(join(output, `${source.id}.000000000000.hoplite.glb`), '');
writeFileSync(join(output, `${source.id}-other.000000000000.json`), '{}');
writeFileSync(join(output, 'civ1-pixelart.000000000000.png'), '');
writeFileSync(join(output, `${source.id}.notes.txt`), '');

const built = buildModelSet(shipped, output),
  base = `${source.id}.${hash}`,
  manifest = JSON.parse(
    readFileSync(join(output, `${base}.json`), 'utf8')
  ) as typeof source,
  read = readModelManifest(manifest);

expect(
  'built: its manifest under its id and its hash, naming each model as it’s copied beside it, and read as a set of models',
  [
    built.manifest,
    built.name,
    Object.entries(manifest.models).map(([name, { file }]) => [name, file]),
    typeof read === 'string' ? read : 'read',
    manifest.names,
  ],
  [
    `dist/sets/${base}.json`,
    '0 A.D.: ancient units',
    Object.keys(source.models).map((name) => [name, `${base}.${name}.glb`]),
    'read',
    source.names,
  ]
);

expect(
  'each model copied as it is, as its SHA-256 says, a glTF binary whole in itself',
  Object.entries(source.models).map(([name, model]) => {
    const copied = readFileSync(join(output, `${base}.${name}.glb`));

    return [
      name,
      sha256(copied) === model.sha256,
      copied.equals(readFileSync(join(dirname(shipped), model.file))),
      selfContained(
        copied.buffer.slice(
          copied.byteOffset,
          copied.byteOffset + copied.byteLength
        ) as ArrayBuffer
      ),
    ];
  }),
  Object.keys(source.models).map((name) => [name, true, true, true])
);

expect(
  'the set’s files from before removed, and nothing else',
  readdirSync(output)
    .filter((file) => !file.startsWith(`${base}.`))
    .sort(),
  [
    `${source.id}-other.000000000000.json`,
    `${source.id}.notes.txt`,
    'civ1-pixelart.000000000000.png',
  ]
);

// Built again from the same manifest: the same names, nothing removed.
const again = buildModelSet(shipped, output);

expect(
  'built again, it’s where it was',
  [
    again.manifest === built.manifest,
    readdirSync(output).filter((file) => file.startsWith(`${base}.`)).length,
  ],
  [true, Object.keys(source.models).length + 1]
);

// A set whose models aren't as its manifest says: the build fails, saying why.
{
  const set = mkdtempSync(join(tmpdir(), 'hosted-models-bad-')),
    model = Buffer.from('glTF model'),
    failure = (change: (json: any) => void): string => {
      const json: any = {
        id: 'test-set',
        name: 'A test set',
        models: {
          soldier: { file: 'models/soldier.glb', sha256: sha256(model) },
        },
        names: { unit: { Warrior: 'soldier' } },
      };

      change(json);
      writeFileSync(join(set, 'manifest.json'), JSON.stringify(json));

      try {
        buildModelSet(
          join(set, 'manifest.json'),
          mkdtempSync(join(tmpdir(), 'hosted-models-out-'))
        );

        return 'built';
      } catch (error) {
        return (error as Error).message;
      }
    };

  mkdirSync(join(set, 'models'));
  writeFileSync(join(set, 'models', 'soldier.glb'), model);
  writeFileSync(join(set, 'elsewhere.glb'), model);
  // A link beside the manifest to a file outside the set.
  const outside = mkdtempSync(join(tmpdir(), 'hosted-models-outside-'));

  writeFileSync(join(outside, 'soldier.glb'), model);
  symlinkSync(join(outside, 'soldier.glb'), join(set, 'models', 'linked.glb'));

  expect(
    'a model missing, not beside its manifest (a link to elsewhere among them), not the file it says, or without a SHA-256 to say so, or a set with no id to name its files by, fails the build, saying why',
    [
      failure(() => undefined),
      failure((json) => (json.models.soldier.file = 'models/missing.glb')),
      failure((json) => (json.models.soldier.file = '../elsewhere.glb')),
      failure((json) => (json.models.soldier.file = '/etc/hosts')),
      failure((json) => (json.models.soldier.sha256 = sha256('other'))),
      failure((json) => delete json.models.soldier.sha256),
      failure((json) => (json.models.soldier.file = 'models')),
      failure((json) => (json.models.soldier.file = 'models/linked.glb')),
      failure((json) => (json.models['Soldier!'] = json.models.soldier)),
      failure((json) => (json.id = '../test')),
      failure((json) => delete json.id),
    ],
    [
      'built',
      'test-set: model soldier has no models/missing.glb',
      "test-set: model soldier isn't beside its manifest",
      "test-set: model soldier isn't beside its manifest",
      "test-set: models/soldier.glb isn't the file its manifest says",
      'test-set: model soldier has no SHA-256',
      'test-set: model soldier has no models',
      "test-set: model soldier isn't beside its manifest",
      "test-set: model Soldier! isn't beside its manifest",
      `${join(set, 'manifest.json')}: no id to name its files by`,
      `${join(set, 'manifest.json')}: no id to name its files by`,
    ]
  );
}

// Two packages declaring sets under one id, which would remove each other's files, or one declaring a set that isn't
//  installed: the build fails, saying why.
{
  const root = mkdtempSync(join(tmpdir(), 'hosted-models-root-')),
    declare = (name: string, manifest: string): void => {
      mkdirSync(join(root, 'packages', name), { recursive: true });
      writeFileSync(
        join(root, 'packages', name, 'package.json'),
        JSON.stringify({ 'civ-clone': { hostedModels: [{ manifest }] } })
      );
    },
    built = (): string => {
      try {
        buildHostedModels(root);

        return 'built';
      } catch (error) {
        return (error as Error).message;
      }
    };

  declare('first', shipped);
  declare('second', shipped);

  const twice = built();

  declare('second', '@civ-clone/not-installed/manifest.json');

  expect(
    'two sets under one id, or one that isn’t installed, fail the build, saying why',
    [twice, built()],
    [
      `two hosted sets of models are ${source.id}`,
      "second declares @civ-clone/not-installed/manifest.json, which isn't installed: run pnpm install",
    ]
  );
}

// Each realistic set built the same way: its manifest read as a set of models, and each model copied as it is, as its
//  SHA-256 says, a glTF binary whole in itself.
realistic.forEach(({ name: setName, path, text, source: laterSource }) => {
  const laterOutput = mkdtempSync(join(tmpdir(), 'hosted-models-later-')),
    laterBuilt = buildModelSet(path, laterOutput),
    laterBase = `${laterSource.id}.${sha256(text).slice(0, 12)}`,
    laterManifest = JSON.parse(
      readFileSync(join(laterOutput, `${laterBase}.json`), 'utf8')
    ) as typeof laterSource,
    laterRead = readModelManifest(laterManifest);

  expect(
    `${setName} built: its manifest under its id and hash, read as a set of models, each model copied as it is, whole in itself`,
    [
      laterBuilt.manifest,
      typeof laterRead === 'string' ? laterRead : 'read',
      Object.entries(laterSource.models).map(([name, model]) => {
        const copied = readFileSync(
          join(laterOutput, `${laterBase}.${name}.glb`)
        );

        return [
          name,
          laterManifest.models[name]?.file === `${laterBase}.${name}.glb`,
          sha256(copied) === model.sha256,
          selfContained(
            copied.buffer.slice(
              copied.byteOffset,
              copied.byteOffset + copied.byteLength
            ) as ArrayBuffer
          ),
        ];
      }),
    ],
    [
      `dist/sets/${laterBase}.json`,
      'read',
      Object.keys(laterSource.models).map((name) => [name, true, true, true]),
    ]
  );
});

// What the page has of the set: where its manifest is, beside the page, as built for the suite, and what the library
//  shows of it.
expect(
  'the page has where the set’s manifest is, as it’s built beside it, and its licence with the credit it asks for',
  [
    ancientUnits.manifest,
    existsSync(join(root, ancientUnits.manifest)),
    ancientUnits.licence.name,
    ancientUnits.licence.attribution?.includes('Wildfire Games'),
    ancientUnits.credits.map(({ author }) => author),
  ],
  [`dist/sets/${base}.json`, true, 'CC BY-SA 3.0', true, ['Wildfire Games']]
);

expect(
  'and of the realistic units’, after 0 A.D.’s: where each manifest is, as it’s built beside it, and its licence with the credit it gives, which links its list of credits',
  [
    hostedModelSets.map(({ id }) => id),
    [realisticUnits, creditedUnits].map(({ manifest, licence }) => [
      manifest,
      existsSync(join(root, manifest)),
      licence.name,
      licence.attribution?.includes(
        `https://github.com/civ-clone/${
          manifest.includes('realistic-cc0')
            ? 'models-realistic-cc0'
            : 'models-realistic-by'
        }/blob/main/CREDITS.md`
      ),
    ]),
  ],
  [
    ['0ad-ancient', 'realistic-cc0', 'realistic-by'],
    realistic.map(({ text, source: { id } }, index) => [
      `dist/sets/${id}.${sha256(text).slice(0, 12)}.json`,
      true,
      ['CC0 1.0', 'CC BY 4.0'][index],
      true,
    ]),
  ]
);

// Every work each is made from, as the library lists them: each credit its manifest gives, its author's among them.
expect(
  'each realistic set has every credit its manifest gives, for the library to list',
  [realisticUnits, creditedUnits].map(({ credits }) => credits),
  realistic.map(({ source: { credits } }) => credits)
);

// Each unit type drawn by one set: none is drawn by two.
expect(
  'no unit type is drawn by two sets',
  [source, ...realistic.map(({ source }) => source)].flatMap(
    ({ names }, index, sets) =>
      Object.keys(names.unit).filter((type) =>
        sets
          .slice(index + 1)
          .some(({ names: later }) =>
            Object.prototype.hasOwnProperty.call(later.unit, type)
          )
      )
  ),
  []
);

// And between them, every unit type the 3D map knows (Civ1's and Civ2's) is drawn by one.
expect(
  'every unit type the 3D map knows is drawn by one of the sets that ship',
  Object.keys(unitTable).filter(
    (type) =>
      ![source, ...realistic.map(({ source }) => source)].some(({ names }) =>
        Object.prototype.hasOwnProperty.call(names.unit, type)
      )
  ),
  []
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL hostedModels: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS hostedModels (${checks} checks)\n`);
