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

// `$ref` beside other keywords: both apply, as 2020-12 has it, and inside an `allOf` (as the tileset schema writes it,
//  for editors that copy a `$ref`'s schema over its neighbours).
const defs = {
  whole: { type: 'integer', 'x-message': '{path} must be whole' },
};

expect(
  '$ref with keywords beside it, directly or in an allOf, checks both',
  [
    passes({ $ref: '#/$defs/whole', minimum: 1, $defs: defs }, [1, 0, 1.5]),
    passes(
      { allOf: [{ $ref: '#/$defs/whole' }], minimum: 1, $defs: defs },
      [1, 0, 1.5]
    ),
  ],
  [
    [true, false, false],
    [true, false, false],
  ]
);
expect(
  'a missing property is told with the message of what it refers to, through a $ref or an allOf of one',
  [
    { properties: { a: { $ref: '#/$defs/whole' } } },
    { properties: { a: { allOf: [{ $ref: '#/$defs/whole' }] } } },
    {
      properties: {
        a: { allOf: [{ $ref: '#/$defs/whole' }, { minimum: 1 }] },
      },
      'x-message': 'the object',
    },
  ].map(
    (schema) =>
      failureOf({ ...schema, required: ['a'], $defs: defs }, {})?.message
  ),
  ['{path} must be whole', '{path} must be whole', 'the object']
);

// Only a schema's own keys, and a document's own properties, are read: never `Object.prototype`'s.
expect(
  "names that are Object.prototype's are not taken for types, keywords, definitions or properties",
  [
    ...[
      { type: 'constructor' },
      { type: 'toString' },
      { $ref: '#/$defs/toString', $defs: {} },
      JSON.parse('{"constructor": 1}'),
      JSON.parse('{"toString": 1}'),
      JSON.parse('{"__proto__": 1}'),
      { 'x-message': { toString: 'no' } },
    ].map((schema) => thrown(() => firstFailure(schema, 'x'))),
    passes({ properties: { a: true }, additionalProperties: false }, [
      JSON.parse('{"toString": 1}'),
      JSON.parse('{"__proto__": 1}'),
      { a: 1 },
    ]),
  ],
  [
    'Schema: "type" cannot be "constructor".',
    'Schema: "type" cannot be "toString".',
    'Schema: "#/$defs/toString" names no schema in its $defs.',
    'Schema: the keyword "constructor" is not one this checker knows.',
    'Schema: the keyword "toString" is not one this checker knows.',
    'Schema: the keyword "__proto__" is not one this checker knows.',
    'Schema: "x-message" is a sentence, or sentences by keywords this checker knows, not {"toString":"no"}.',
    [false, false, true],
  ]
);

// A `$ref` that comes back to itself, never reaching a property or an item, would be followed for ever.
const loop =
  'Schema: its "$ref"s lead back to where they started, without reaching a property or an item.';

expect(
  'a $ref that leads back to itself is refused, directly or through allOf, anyOf or not',
  [
    { $ref: '#/$defs/a', $defs: { a: { $ref: '#/$defs/a' } } },
    {
      $ref: '#/$defs/a',
      $defs: {
        a: { allOf: [{ $ref: '#/$defs/b' }] },
        b: { $ref: '#/$defs/a' },
      },
    },
    { $defs: { a: { anyOf: [true, { $ref: '#/$defs/a' }] } } },
    { $defs: { a: { not: { $ref: '#/$defs/a' } } } },
  ].map((schema) => thrown(() => firstFailure(schema, 1))),
  [loop, loop, loop, loop]
);
// Many ways to the same schema are not a way back to it: each is followed once, however many lead there. Followed
//  way by way, forty levels that each name the next twice would be 2^40 walks.
const wide: { [name: string]: unknown } = {};

for (let level = 0; level < 40; level++) {
  wide[`l${level}`] =
    level === 39
      ? { type: 'number' }
      : {
          anyOf: [
            { $ref: `#/$defs/l${level + 1}` },
            { $ref: `#/$defs/l${level + 1}` },
          ],
        };
}

expect(
  'schemas that many ways lead to are each read once, and are not taken for a way back',
  [
    firstFailure({ $ref: '#/$defs/l0', $defs: wide }, 1),
    firstFailure(
      {
        allOf: [{ $ref: '#/$defs/a' }, { $ref: '#/$defs/b' }],
        $defs: {
          a: { $ref: '#/$defs/c' },
          b: { $ref: '#/$defs/c' },
          c: { type: 'number' },
        },
      },
      1
    ),
  ],
  [null, null]
);
expect(
  "a required property is looked for among the schema's own properties: one named for something every object has gets the object's sentence",
  firstFailure(
    {
      type: 'object',
      properties: { a: true },
      required: ['toString'],
      'x-message': 'needs a toString of its own',
    },
    {}
  )?.message,
  'needs a toString of its own'
);
expect(
  'while one that reaches a property or an item first is a tree, checked as deep as the document goes',
  passes(
    {
      $ref: '#/$defs/tree',
      $defs: {
        tree: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            kids: { type: 'array', items: { $ref: '#/$defs/tree' } },
            parent: { $ref: '#/$defs/tree' },
          },
        },
      },
    },
    [
      { name: 'a', kids: [{ name: 'b', kids: [{ name: 'c' }] }] },
      { name: 'a', kids: [{ name: 'b', kids: [{ name: 3 }] }] },
      { parent: { parent: { name: 'x' } } },
      { parent: { parent: 'x' } },
    ]
  ),
  [true, false, true, false]
);

// Arguments it would misread are refused when the schema is read, not when a document reaches them.
expect(
  'an invalid pattern, no types, a negative or fractional count, or a message for an unknown keyword is refused',
  [
    { properties: { a: { pattern: '(' } } },
    { type: [] },
    { minLength: -1 },
    { minLength: 1.5 },
    { minItems: -1 },
    { 'x-message': { mimItems: 'none' } },
    { 'x-message': 5 },
    // A misspelt x-message is an x- annotation like any other.
    { 'x-messge': { mimItems: 'none' } },
  ].map((schema) => thrown(() => firstFailure(schema, 'x'))),
  [
    'Schema: "pattern" cannot be "(".',
    'Schema: "type" cannot be [].',
    'Schema: "minLength" cannot be -1.',
    'Schema: "minLength" cannot be 1.5.',
    'Schema: "minItems" cannot be -1.',
    'Schema: "x-message" is a sentence, or sentences by keywords this checker knows, not {"mimItems":"none"}.',
    'Schema: "x-message" is a sentence, or sentences by keywords this checker knows, not 5.',
    null,
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
