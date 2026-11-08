// The source tree's own imports, read from the files, for the tests that hold its boundaries (#825). Relative
//  specifiers only: packages from npm are not part of the tree.
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';

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

// `import … from`, `export … from`, a bare `import '…'`, `import('…')` and `require('…')`.
const specifiers =
  /\b(?:import|export)\s[^;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

/** The files `path` imports, as paths, each resolved as esbuild would (a missing one is left as written). */
export const importsOf = (path: string): string[] => [
  ...new Set(
    [...readFileSync(path, 'utf8').matchAll(specifiers)]
      .map(
        (match) => match.slice(1).find((spec) => spec !== undefined) as string
      )
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
