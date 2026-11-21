// A set of models that ships with civ.one (docs/3d-renderer.md §10, `tools/lib/hostedSets.js`): its models copied
//  beside the page under names with its manifest's hash in them, each as the manifest's SHA-256 says it is, and its
//  manifest naming them so, which the 3D map reads and loads as it does any set's; the set's files from before removed,
//  and nothing else; a model missing, not beside its manifest, or not the file it says, failing the build. The set the
//  renderer declares, 0 A.D.'s ancient units, is built as the suite's runner builds it, and the page asks for it under
//  `?3d=1`, unless it asked for another.

import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { readModelManifest } from '@civ-clone/ui-map-3d/models/modelSet';
import { selfContained } from '@civ-clone/ui-map-3d/models/loadModels';
import ancientUnits from '@civ-clone/ui-models-0ad';

const { buildModelSet, declaredModelSets } =
  require('../../tools/lib/hostedSets') as {
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

// The renderer's own set, declared by the package that ships it.
expect(
  'the renderer declares 0 A.D.’s ancient units, from the package that ships them',
  declaredModelSets(root).map(({ directory, manifest }) => [
    directory.split(/[\\/]/).slice(-2).join('/'),
    manifest === shipped,
  ]),
  [['packages/models-0ad', true]]
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

  expect(
    'a model missing, not beside its manifest, or not the file it says, or a set with no id to name its files by, fails the build, saying why',
    [
      failure(() => undefined),
      failure((json) => (json.models.soldier.file = 'models/missing.glb')),
      failure((json) => (json.models.soldier.file = '../elsewhere.glb')),
      failure((json) => (json.models.soldier.file = '/etc/hosts')),
      failure((json) => (json.models.soldier.sha256 = sha256('other'))),
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
      "test-set: model Soldier! isn't beside its manifest",
      `${join(set, 'manifest.json')}: no id to name its files by`,
      `${join(set, 'manifest.json')}: no id to name its files by`,
    ]
  );
}

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

if (failures.length > 0) {
  process.stderr.write(
    `FAIL hostedModels: ${
      failures.length
    } of ${checks} checks failed\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS hostedModels (${checks} checks)\n`);
