import type { Asset } from '../AssetStore';
import { interfaceTileset } from './tilesets';

// How a set's art or sound is imported from the player's own copy of the game it comes from (#97, #1063): each set's
//  package registers what files it reads and how it reads them, and the library asks every registered set, rather
//  than knowing any by name. Each set has an import window of its own, which reads only its files.

/** A file chosen to import, as far as which set reads it goes: its name. */
export type ChosenFile = Pick<File, 'name'>;

/** How the import window asks a set to read its files. */
export interface ImportOptions {
  /** The keys the store holds already: without `replaceExisting`, what they hold needn't be cut again. */
  existingKeys: string[];
  /** Whether the player asked for every sprite to be cut again, whatever the store holds. */
  replaceExisting: boolean;
  /** Says how far the import has got, while the files are being read. */
  progress: (message: string) => void;
  /** Whether the import still wants the files' sprites: not once another file has stopped it. */
  wanted: () => boolean;
}

/** What a set's import gives back: the records to store. */
export interface PackImportResult {
  assets: Asset[];
}

/** What a set has to say of its import (`PackImport.status`): its lines, and whether it is still to be finished. */
export interface PackImportStatus {
  lines: string[];
  incomplete: boolean;
}

/** The files a set still wants (`PackImport.filesWanted`): the ones it needs to be ready, and the ones it can add. */
export interface FilesWanted {
  required: string[];
  optional: string[];
}

/**
 * A set's import, as its package registers it (`registerPackImport`). The import window stores its records. Each set's
 *  import goes ahead on its own, in any order (#1063): civ.one's own art draws the game, so none waits on Civ1's.
 */
export interface PackImport {
  /** The set's id, as its manifest's (its tileset descriptor's, or its sound set's). */
  id: string;
  /** The set's name, as the player sees it: its manifest's. */
  name: string;
  /** The game whose files it reads, by name, for the library to say it comes from the player's copy of it. */
  game(): string;
  /**
   * The files it needs to be ready, each matched against the chosen files' names whatever their case. Civ1's import
   *  can't go ahead without all of them; another's takes some of them at a time.
   */
  requiredFiles: string[];
  /** The files it reads when they're chosen, that it is ready without: they only add to it. */
  optionalFiles: string[];
  /**
   * Whether its import stores everything it reads again, whatever is stored, so the window offers no choice of
   *  replacing what's there (`ImportOptions.replaceExisting`): the music's driver, kept whole.
   */
  replacesAll?: boolean;
  /** Whether `file` is one of the files it reads, by its name, whatever its case. */
  accepts(file: ChosenFile): boolean;
  /** Whether `file` is one of its own that it takes and leaves alone (Civ2's RULES.TXT), rather than one none reads. */
  ignores?(file: ChosenFile): boolean;
  /** What its import window's instructions say of its files. */
  instructions(): string;
  /**
   * Reads `files`, each one it `accepts`, and cuts out the sprites wanted, as the records to store. Rejects with an
   *  `UnsupportedFile` naming one that can't be read.
   */
  import(files: File[], options: ImportOptions): Promise<PackImportResult>;
  /** Whether every sprite or file it requires is stored. False for a store that can't be read. */
  ready(): Promise<boolean>;
  /**
   * The files still to import, required and optional, or null when none of it is stored (or the store can't be read):
   *  the library says it needs them.
   */
  filesWanted(): Promise<FilesWanted | null>;
  /**
   * What its import window says of the set as it opens, and after an import: nothing, for a set with nothing to say.
   *  An incomplete one leaves the page for the player to reload.
   */
  status?(): Promise<PackImportStatus>;
}

/** The error a pack's import rejects with for a file it can't read: which file it was. */
export type UnsupportedFile = Error & { file: string };

/** An `UnsupportedFile` naming `file`, with `message`, for `cause`. */
export const unsupportedFile = (
  file: string,
  message: string,
  cause: unknown
): UnsupportedFile =>
  Object.assign(new Error(message, { cause }), { file }) as UnsupportedFile;

export const isUnsupportedFile = (error: unknown): error is UnsupportedFile =>
  error instanceof Error && typeof (error as UnsupportedFile).file === 'string';

/**
 * Whether `pack` is the interface's pack (Civ1's), listed first: its import is the one that can't go ahead without all
 *  its required files, and is done once its sprites are all in. Nothing else waits on it since #1063.
 */
export const importedFirst = ({ id }: Pick<PackImport, 'id'>): boolean =>
  id === interfaceTileset().id;

const registered: PackImport[] = [];

/** Lets the library import `pack`'s files: its package calls this as it is loaded. Once per set id. */
export const registerPackImport = (pack: PackImport): void => {
  if (registered.some(({ id }) => id === pack.id)) {
    throw new Error(`An import for "${pack.id}" is registered already.`);
  }

  registered.push(pack);
};

/** Every set's import: Civ1's first (`importedFirst`), then the rest, each as they were registered. */
export const packImports = (): PackImport[] => [
  ...registered.filter(importedFirst),
  ...registered.filter((pack) => !importedFirst(pack)),
];

/**
 * The required files `pack`'s import still needs, as the library names them and the first set's window asks for them:
 *  none once it's ready; those still wanted (`filesWanted`) when some of it is stored; and every one when none is, or
 *  when what's missing is in no file it can name.
 */
export const filesNeeded = async (pack: PackImport): Promise<string[]> => {
  const [ready, wanted] = await Promise.all([pack.ready(), pack.filesWanted()]);

  if (ready) {
    return [];
  }

  return wanted !== null && wanted.required.length > 0
    ? wanted.required
    : pack.requiredFiles;
};

/** The import of the set with `id`, if one is registered. */
export const packImportOf = (id: string): PackImport | undefined =>
  registered.find((pack) => pack.id === id);
