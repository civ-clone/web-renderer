// The small JSON Schema checker the tileset descriptor is checked with (#869): each keyword it knows, as draft 2020-12
//  has it; the messages a schema gives with `x-message`, and where they are taken from; and a schema with a keyword it
//  doesn't know refused rather than read as saying less than it does.

import firstFailure, {
  Schema,
  pathName,
} from '@civ-clone/ui-assets/lib/jsonSchema';
import civ1Json from '@civ-clone/ui-assets/tilesets/civ1.json';
import tilesetSchema from '@civ-clone/ui-assets/tilesets/tileset.schema.json';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that never reaches its checks must not pass by exiting 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(`FAIL jsonSchema: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

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

// The message `fn` throws, or `null` when it does not.
const thrown = (fn: () => unknown): string | null => {
  try {
    fn();

    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

// Whether each of `values` passes `schema`.
const passes = (schema: Schema, values: unknown[]): boolean[] =>
  values.map(
    (value) =>
      firstFailure(schema as { [key: string]: unknown }, value) === null
  );

const failureOf = (schema: { [key: string]: unknown }, value: unknown) =>
  firstFailure(schema, value);

// Each keyword.
expect(
  'type: each JSON type, an integer is a whole number, and a number is finite',
  [
    passes({ type: 'object' }, [{}, [], null]),
    passes({ type: 'array' }, [[], {}]),
    passes({ type: 'string' }, ['', 1]),
    passes({ type: 'boolean' }, [false, 0]),
    passes({ type: 'null' }, [null, undefined]),
    passes({ type: 'integer' }, [1, 1.0, 1.5, '1']),
    passes({ type: 'number' }, [1.5, Infinity, NaN, '1']),
    passes({ type: ['string', 'null'] }, ['x', null, 1]),
  ],
  [
    [true, false, false],
    [true, false],
    [true, false],
    [true, false],
    [true, false],
    [true, true, false, false],
    [true, false, false, false],
    [true, true, false],
  ]
);
expect(
  'const and enum: the same value',
  [
    passes({ const: 1 }, [1, 1.0, '1', true]),
    passes({ enum: ['a', null] }, ['a', null, 'b', undefined]),
  ],
  [
    [true, true, false, false],
    [true, true, false, false],
  ]
);
expect(
  'minimum, maximum, minLength, minItems and pattern: only for their own type',
  [
    passes({ minimum: 0, maximum: 1 }, [0, 1, 0.5, -0.1, 1.1, 'x', null]),
    passes({ minLength: 2 }, ['ab', 'a', '😀😀', '😀', 5]),
    passes({ minItems: 1 }, [[1], [], 'x']),
    passes({ pattern: '^#[0-9a-f]{3}$' }, ['#abc', '#ABC', '#abcd', 1]),
    // A pattern is unanchored, as the standard has it.
    passes({ pattern: 'b' }, ['abc', 'xyz']),
  ],
  [
    [true, true, true, false, false, true, true],
    [true, false, true, false, true],
    [true, false, true],
    [true, false, false, true],
    [true, false],
  ]
);
expect(
  'items, properties and additionalProperties: each one within, a property only when it is there',
  [
    passes({ items: { type: 'integer' } }, [[1, 2], [1, 'x'], [], 'x']),
    passes({ properties: { a: { type: 'string' } } }, [
      { a: 'x' },
      { a: 1 },
      {},
      { a: undefined },
      [],
    ]),
    passes(
      {
        properties: { a: { type: 'string' } },
        additionalProperties: { type: 'integer' },
      },
      [{ a: 'x', b: 1 }, { a: 'x', b: 'y' }, { b: undefined }]
    ),
    passes({ additionalProperties: false }, [{}, { a: 1 }]),
  ],
  [
    [true, false, true, true],
    [true, false, true, true, true],
    [true, false, false],
    [true, false],
  ]
);
expect(
  'required: a property set to undefined is missing',
  passes({ required: ['a'] }, [{ a: 0 }, {}, { a: undefined }, 'x']),
  [true, false, false, true]
);
expect(
  'allOf, anyOf, not, $ref and true and false',
  [
    passes({ allOf: [{ minimum: 0 }, { maximum: 1 }] }, [0.5, -1, 2]),
    passes({ anyOf: [{ type: 'string' }, { type: 'null' }] }, ['x', null, 1]),
    passes({ not: { const: 1 } }, [2, 1]),
    passes(
      {
        $ref: '#/$defs/whole',
        $defs: { whole: { type: 'integer' } },
      },
      [1, 1.5]
    ),
    passes(true, [1]),
    passes(false, [1]),
  ],
  [
    [true, false, false],
    [true, true, false],
    [true, false],
    [true, false],
    [true],
    [false],
  ]
);
expect(
  'annotations and x- extensions say nothing about a document',
  passes(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'x',
      $comment: 'x',
      title: 'x',
      description: 'x',
      default: 1,
      examples: [1],
      'x-anything': { type: 'string' },
    },
    [1, 'x', null]
  ),
  [true, true, true]
);

// What a failure says.
expect(
  'a failure says where, what is there, which keyword and its message',
  [
    failureOf(
      {
        properties: {
          a: {
            items: { minimum: 1, 'x-message': 'too small' },
          },
        },
      },
      { a: [1, 0] }
    ),
    failureOf({ properties: { a: { minimum: 1 } } }, { a: 0 }),
  ],
  [
    { path: ['a', 1], value: 0, keyword: 'minimum', message: 'too small' },
    { path: ['a'], value: 0, keyword: 'minimum', message: null },
  ]
);
expect(
  'one within a schema with nothing to say is told with the nearest message around it, and where that applies',
  failureOf(
    {
      properties: {
        a: {
          properties: { b: { type: 'string' } },
          'x-message': 'a is wrong',
        },
      },
      'x-message': 'all wrong',
    },
    { a: { b: 1 } }
  ),
  { path: ['a'], value: { b: 1 }, keyword: 'type', message: 'a is wrong' }
);
expect(
  'messages by keyword are only for that keyword failing on that schema',
  [{ list: [] }, { list: 'x' }, { list: [1] }, { list: [''] }].map(
    (value) =>
      failureOf(
        {
          properties: {
            list: {
              type: 'array',
              items: {
                type: 'string',
                minLength: 1,
                'x-message': { minLength: 'an empty name' },
              },
              minItems: 1,
              'x-message': { minItems: 'none listed' },
            },
          },
          'x-message': 'not a list',
        },
        value
      )?.message
  ),
  ['none listed', 'not a list', 'not a list', 'an empty name']
);
expect(
  "a missing property is told with its own schema's message, through a $ref, or else its object's",
  [
    { properties: { a: { 'x-message': 'need a' } }, required: ['a'] },
    {
      properties: { a: { 'x-message': { required: 'need a' } } },
      required: ['a'],
    },
    {
      properties: { a: { $ref: '#/$defs/a' } },
      required: ['a'],
      $defs: { a: { 'x-message': 'need a' } },
    },
    { properties: { a: true }, required: ['a'], 'x-message': 'need a' },
    { required: ['a'] },
  ].map((schema) => failureOf(schema, {})),
  [
    { path: ['a'], keyword: 'required', message: 'need a' },
    { path: ['a'], keyword: 'required', message: 'need a' },
    { path: ['a'], keyword: 'required', message: 'need a' },
    { path: [], value: {}, keyword: 'required', message: 'need a' },
    { path: ['a'], keyword: 'required', message: null },
  ]
);
expect(
  'anyOf and not fail as themselves, whatever the schemas within them say',
  [
    failureOf(
      { anyOf: [{ 'x-message': 'no', type: 'string' }], 'x-message': 'yes' },
      1
    )?.message,
    failureOf({ not: { 'x-message': 'no' }, 'x-message': 'yes' }, 1)?.message,
  ],
  ['yes', 'yes']
);
expect(
  'keywords are checked in the order the schema gives them',
  [
    failureOf({ type: 'integer', minimum: 5 }, 1.5)?.keyword,
    failureOf({ minimum: 5, type: 'integer' }, 1.5)?.keyword,
  ],
  ['type', 'minimum']
);
expect(
  'a path is written as an author writes it',
  [
    pathName(['families', 'coast', 'order', 2]),
    pathName([0, 'a']),
    pathName([]),
  ],
  ['families.coast.order[2]', '[0].a', '']
);

// A schema it can't read.
expect(
  "a schema with a keyword it doesn't know is refused, wherever it is, rather than read as saying less",
  [
    { maxLength: 3 },
    { anyOf: [true, { if: { type: 'string' } }] },
    { $defs: { unused: { uniqueItems: true } } },
    { properties: { a: { additionalItems: false } } },
    { properties: { a: { multipleOf: 2 } } },
  ].map((schema) => thrown(() => firstFailure(schema, 'x'))),
  [
    'Schema: the keyword "maxLength" is not one this checker knows.',
    'Schema: the keyword "if" is not one this checker knows.',
    'Schema: the keyword "uniqueItems" is not one this checker knows.',
    'Schema: the keyword "additionalItems" is not one this checker knows.',
    'Schema: the keyword "multipleOf" is not one this checker knows.',
  ]
);
expect(
  "and so is one it can't read, or a reference to anything but its own $defs",
  [
    { type: 'integr' },
    { enum: [{ a: 1 }] },
    { required: 'a' },
    { items: 5 },
    { $ref: '#/$defs/missing', $defs: {} },
    { $ref: 'https://example.com/schema' },
    { $defs: { a: 5 } },
  ].map((schema) => thrown(() => firstFailure(schema, 'x'))),
  [
    'Schema: "type" cannot be "integr".',
    'Schema: "enum" cannot be [{"a":1}].',
    'Schema: "required" cannot be "a".',
    'Schema: "items" cannot be 5.',
    'Schema: "#/$defs/missing" names no schema in its $defs.',
    'Schema: "https://example.com/schema" names no schema in its $defs.',
    'Schema: a schema is an object, true or false, not 5.',
  ]
);

// The tileset descriptor's schema is one it reads, and Civ1's descriptor passes it.
expect(
  "the tileset schema uses only what it knows, and Civ1's descriptor passes",
  [
    thrown(() => firstFailure(tilesetSchema, civ1Json)),
    firstFailure(tilesetSchema, civ1Json),
  ],
  [null, null]
);
expect(
  'and Civ1 names the schema, for editors',
  (civ1Json as { $schema?: string }).$schema,
  './tileset.schema.json'
);

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL jsonSchema (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS jsonSchema (${checks} checks)\n`);
