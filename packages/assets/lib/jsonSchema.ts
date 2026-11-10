// A small JSON Schema (draft 2020-12) checker, for the renderer's own schemas such as the tileset descriptor's
//  (`tilesets/tileset.schema.json`, #869): a general validator would add more to the game than the descriptor's
//  checks ever took. It knows only the keywords those schemas use, and refuses a schema with any other rather than
//  ignoring it, so a schema never seems to say more than is checked.
//
// One extension, for messages only: `x-message` on a schema is what to tell the author when a document fails it, or
//  fails a schema within it that has nothing to say itself. It is a sentence, or an object of sentences by keyword
//  (`{ "minItems": "…" }`), each read only when that keyword fails on that schema. A missing required property is
//  told with its own schema's message (its sentence, or its sentence for `required`), or else its object's.
//
// A schema's keywords are checked in the order it gives them, and the first failure is the one reported.

export type Schema = boolean | { [keyword: string]: unknown };

export type Path = (string | number)[];

export interface SchemaFailure {
  /** Where the schema whose message is used applies, from the document's root; where it failed, when none has one. */
  path: Path;
  /** What is at `path`: `undefined` for a missing property. */
  value: unknown;
  /** The keyword that failed. */
  keyword: string;
  /** The `x-message` that tells of it, or `null`. */
  message: string | null;
}

type Schemas = { [keyword: string]: unknown };

// Where a keyword is being checked.
interface Here {
  schema: Schemas;
  value: unknown;
  path: Path;
  root: Schemas;
}

// Words a schema may have that say nothing about a document, besides `x-` ones.
const annotations = [
  '$schema',
  '$id',
  '$comment',
  '$defs',
  'title',
  'description',
  'default',
  'examples',
];

const isObject = (value: unknown): value is { [key: string]: unknown } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPrimitive = (value: unknown): boolean =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

const isSchema = (value: unknown): boolean =>
  typeof value === 'boolean' || isObject(value);

const isNumber = (value: unknown): boolean => typeof value === 'number';

// Present, as JSON has it: a property set to `undefined` is missing.
const has = (value: { [key: string]: unknown }, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;

// Whether `value` is of each JSON type. A number is finite: JSON has no other.
const types: { [type: string]: (value: unknown) => boolean } = {
  object: isObject,
  array: Array.isArray,
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === 'boolean',
  null: (value) => value === null,
};

// The `x-message` `schema` gives for `keyword` failing on it, or for anything within it failing when `keyword` is
//  `null`: only a sentence for all of them tells of those.
const messageFor = (schema: Schema, keyword: string | null): string | null => {
  const message = isObject(schema) ? schema['x-message'] : undefined;

  if (typeof message === 'string' || keyword === null) {
    return typeof message === 'string' ? message : null;
  }

  return isObject(message) && typeof message[keyword] === 'string'
    ? (message[keyword] as string)
    : null;
};

// The schema `reference` names, `#/$defs/<name>`: the only kind there are.
const resolve = (reference: string, root: Schemas): Schema => {
  const name = /^#\/\$defs\/([^/~%]+)$/.exec(reference)?.[1],
    definitions = root.$defs;

  if (name === undefined || !isObject(definitions) || !(name in definitions)) {
    throw new Error(`Schema: "${reference}" names no schema in its $defs.`);
  }

  return definitions[name] as Schema;
};

// The first failure `check` finds for any of `items`, or `null`.
const firstOf = <T>(
  items: T[],
  check: (item: T, index: number) => SchemaFailure | null
): SchemaFailure | null =>
  items.reduce<SchemaFailure | null>(
    (failure, item, index) => failure ?? check(item, index),
    null
  );

// A required property that is missing, told with its own schema's message when it (or what it refers to) has one.
const missing = (schema: Schema, path: Path, root: Schemas): SchemaFailure => {
  const message = messageFor(schema, 'required');

  return message === null && isObject(schema) && typeof schema.$ref === 'string'
    ? missing(resolve(schema.$ref, root), path, root)
    : { path, value: undefined, keyword: 'required', message };
};

/**
 * Each keyword this checker knows: whether it can read what a schema gives it, and how a value is checked against
 * that. A check passes with `true` or `null`, fails itself with `false`, or hands on a failure from within.
 */
const keywords: {
  [keyword: string]: [
    (argument: unknown) => boolean,
    (argument: any, here: Here) => boolean | SchemaFailure | null
  ];
} = {
  type: [
    (argument) =>
      ([] as unknown[])
        .concat(argument)
        .every((type) => typeof type === 'string' && type in types),
    (argument, { value }) =>
      ([] as string[]).concat(argument).some((type) => types[type](value)),
  ],
  const: [isPrimitive, (argument, { value }) => value === argument],
  enum: [
    (argument) => Array.isArray(argument) && argument.every(isPrimitive),
    (argument: unknown[], { value }) => argument.includes(value),
  ],
  minimum: [
    isNumber,
    (argument, { value }) => typeof value !== 'number' || value >= argument,
  ],
  maximum: [
    isNumber,
    (argument, { value }) => typeof value !== 'number' || value <= argument,
  ],
  minLength: [
    Number.isInteger,
    (argument, { value }) =>
      typeof value !== 'string' || [...value].length >= argument,
  ],
  pattern: [
    (argument) => typeof argument === 'string',
    (argument, { value }) =>
      typeof value !== 'string' || new RegExp(argument, 'u').test(value),
  ],
  minItems: [
    Number.isInteger,
    (argument, { value }) => !Array.isArray(value) || value.length >= argument,
  ],
  items: [
    isSchema,
    (argument, { value, path, root }) =>
      !Array.isArray(value) ||
      firstOf(value, (item, index) =>
        check(argument, item, [...path, index], root)
      ),
  ],
  properties: [
    (argument) => isObject(argument) && Object.values(argument).every(isSchema),
    (argument: Schemas, { value, path, root }) =>
      !isObject(value) ||
      firstOf(Object.keys(argument), (key) =>
        has(value, key)
          ? check(argument[key] as Schema, value[key], [...path, key], root)
          : null
      ),
  ],
  additionalProperties: [
    isSchema,
    (argument, { schema, value, path, root }) =>
      !isObject(value) ||
      firstOf(Object.keys(value), (key) =>
        isObject(schema.properties) && key in schema.properties
          ? null
          : check(argument, value[key], [...path, key], root)
      ),
  ],
  required: [
    (argument) =>
      Array.isArray(argument) &&
      argument.every((key) => typeof key === 'string'),
    (argument: string[], { schema, value, path, root }) => {
      const key = isObject(value)
        ? argument.find((key) => !has(value, key))
        : undefined;

      return (
        key === undefined ||
        missing(
          (isObject(schema.properties)
            ? (schema.properties[key] as Schema | undefined)
            : undefined) ?? true,
          [...path, key],
          root
        )
      );
    },
  ],
  allOf: [
    (argument) => Array.isArray(argument) && argument.every(isSchema),
    (argument: Schema[], { value, path, root }) =>
      firstOf(argument, (each) => check(each, value, path, root)),
  ],
  anyOf: [
    (argument) => Array.isArray(argument) && argument.every(isSchema),
    (argument: Schema[], { value, path, root }) =>
      argument.some((each) => check(each, value, path, root) === null),
  ],
  not: [
    isSchema,
    (argument, { value, path, root }) =>
      check(argument, value, path, root) !== null,
  ],
  $ref: [
    (argument) => typeof argument === 'string',
    (argument, { value, path, root }) =>
      check(resolve(argument, root), value, path, root),
  ],
};

// The first way `value`, at `path`, fails `schema`, or `null`.
const check = (
  schema: Schema,
  value: unknown,
  path: Path,
  root: Schemas
): SchemaFailure | null => {
  if (typeof schema === 'boolean') {
    return schema ? null : { path, value, keyword: 'false', message: null };
  }

  for (const keyword of Object.keys(schema)) {
    if (annotations.includes(keyword) || keyword.startsWith('x-')) {
      continue;
    }

    const result = keywords[keyword][1](schema[keyword], {
      schema,
      value,
      path,
      root,
    });

    if (result === true || result === null) {
      continue;
    }

    if (result === false) {
      return { path, value, keyword, message: messageFor(schema, keyword) };
    }

    // Something within failed with nothing to say: this schema tells of it, if it can.
    const message = result.message ?? messageFor(schema, null);

    return result.message === null && message !== null
      ? { path, value, keyword: result.keyword, message }
      : result;
  }

  return null;
};

// Throws if `schema`, or any schema within it, has a keyword this checker doesn't know, or one it can't read.
const assertKnown = (schema: unknown, root: Schemas): void => {
  if (typeof schema === 'boolean') {
    return;
  }

  if (!isObject(schema)) {
    throw new Error(
      `Schema: a schema is an object, true or false, not ${JSON.stringify(
        schema
      )}.`
    );
  }

  Object.entries(schema).forEach(([keyword, argument]) => {
    if (keyword === '$defs') {
      Object.values(isObject(argument) ? argument : [argument]).forEach(
        (each) => assertKnown(each, root)
      );
    }

    if (annotations.includes(keyword) || keyword.startsWith('x-')) {
      return;
    }

    if (!(keyword in keywords)) {
      throw new Error(
        `Schema: the keyword "${keyword}" is not one this checker knows.`
      );
    }

    if (!keywords[keyword][0](argument)) {
      throw new Error(
        `Schema: "${keyword}" cannot be ${JSON.stringify(argument)}.`
      );
    }

    if (keyword === '$ref') {
      resolve(argument as string, root);
    }

    // The schemas within it.
    (keyword === 'properties'
      ? Object.values(argument as Schemas)
      : ([] as unknown[]).concat(argument)
    )
      .filter(isSchema)
      .forEach((each) => assertKnown(each, root));
  });
};

const known = new WeakSet<Schemas>();

/**
 * The first way `value` fails `schema`, or `null` when it is valid. Throws, the first time it is given a schema, if
 * the schema has a keyword this checker doesn't know or can't read.
 */
export const firstFailure = (
  schema: Schema,
  value: unknown
): SchemaFailure | null => {
  const root = typeof schema === 'boolean' ? {} : schema;

  if (!known.has(root)) {
    assertKnown(schema, root);
    known.add(root);
  }

  return check(schema, value, [], root);
};

/** `path` as an author writes it: `families.coast.order[2]`. */
export const pathName = (path: Path): string =>
  path
    .map((part, index) =>
      typeof part === 'number' ? `[${part}]` : `${index > 0 ? '.' : ''}${part}`
    )
    .join('');

export default firstFailure;
