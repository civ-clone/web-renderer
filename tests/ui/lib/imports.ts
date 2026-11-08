// The source tree's own imports, read from the files, for the tests that hold its boundaries (#825). Relative
//  specifiers only: packages from npm are not part of the tree.
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import ts from 'typescript';

/** Every `.ts` file under `dir`. */
export const sourcesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

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

/** The files `path` imports, as paths, each resolved as esbuild would (a missing one is left as written). */
export const importsOf = (path: string): string[] => [
  ...new Set(
    specifiersOf(readFileSync(path, 'utf8'))
      .filter((spec) => spec.startsWith('.'))
      .map((spec) => {
        const base = join(dirname(path), spec);

        return (
          [base, `${base}.ts`, `${base}.d.ts`, join(base, 'index.ts')].find(
            isFile
          ) ?? base
        );
      })
  ),
];
