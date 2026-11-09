// The source tree's own imports, read from the files, for the test that holds the packages' lines (#825). Relative
//  specifiers, and the frontend's own packages by name: other packages from npm are not part of the tree.
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import ts from 'typescript';

const scope = '@civ-clone/ui-';

/** Where the frontend's packages are: `packages/<name>/`, each `@civ-clone/ui-<name>`. */
export const packagesRoot = join(process.cwd(), 'packages');

/** The package `path` is in, or `null` for a file in none. */
export const packageOf = (path: string): string | null =>
  path.startsWith(packagesRoot + '/')
    ? relative(packagesRoot, path).split('/')[0]
    : null;

/** Every `.ts` file under `dir`, but for any `node_modules`. */
export const sourcesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    if (name === 'node_modules') {
      return [];
    }

    return statSync(path).isDirectory()
      ? sourcesUnder(path)
      : path.endsWith('.ts')
      ? [path]
      : [];
  });

const isFile = (path: string): boolean =>
  existsSync(path) && statSync(path).isFile();

/**
 * What `source` imports, as written: declarations, `export … from`, bare imports, `import()` and `require()`, read by
 *  TypeScript's own pre-processor, so an import in a comment or a string is not one.
 */
export const specifiersOf = (source: string): string[] =>
  ts
    .preProcessFile(source, true, true)
    .importedFiles.map(({ fileName }) => fileName);

/**
 * The files `path` imports, as paths, each resolved as esbuild would (a missing one is left as written): a relative
 *  specifier from `path`, and a package of the frontend's own from `packages/`, where the workspace links it from.
 */
export const importsOf = (path: string): string[] => [
  ...new Set(
    specifiersOf(readFileSync(path, 'utf8'))
      .filter((spec) => spec.startsWith('.') || spec.startsWith(scope))
      .map((spec) => {
        const base = spec.startsWith(scope)
          ? join(packagesRoot, spec.slice(scope.length))
          : join(dirname(path), spec);

        // A JSON file is itself, even before it's generated: `build.json.d.ts` only types it (#339).
        if (base.endsWith('.json')) {
          return base;
        }

        return (
          [base, `${base}.ts`, `${base}.d.ts`, join(base, 'index.ts')].find(
            isFile
          ) ?? base
        );
      })
  ),
];
