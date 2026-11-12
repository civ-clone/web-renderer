import type { Asset } from '../AssetStore';

// How a pack's sprites are imported from the player's own copy of the game it comes from (#97): each pack's package
//  registers what files it reads and how it reads them, and the Import Assets window asks every registered pack,
//  rather than knowing any by name.

/** A file chosen to import, as far as which pack reads it goes: its name. */
export type ChosenFile = Pick<File, 'name'>;

/** How the import window asks a pack to read its files. */
export interface ImportOptions {
  /** The keys the store holds already: without `replaceExisting`, what they hold needn't be cut again. */
  existingKeys: string[];
  /** Whether the player asked for every sprite to be cut again, whatever the store holds. */
  replaceExisting: boolean;
  /** Says how far the import has got, while the files are being read. */
  progress: (message: string) => void;
  /** Whether the import still wants the files' sprites: not once another file has stopped it. */
  wanted: () => boolean;
  /**
   * Whether one of the files that can't be read is left out, named in `skipped`, rather than stopping the import: it
   *  is, beside the files of a pack the import needs (`requiredFiles`).
   */
  skipUnreadable: boolean;
}

/** What a pack's import gives back: the records to store, and the files it left out (`skipUnreadable`). */
export interface PackImportResult {
  assets: Asset[];
  skipped: string[];
}

/** What a pack has to say of its import (`PackImport.status`): its lines, and whether it is still to be finished. */
export interface PackImportStatus {
  lines: string[];
  incomplete: boolean;
}

/**
 * A pack's import, as its package registers it (`registerPackImport`). The window stores every pack's records in one
 *  go, with the music's, and is done when the interface's pack's sprites are all in (`assetStore.hasAllAssets`).
 */
export interface PackImport {
  /** The pack's id, as its tileset descriptor's. */
  id: string;
  /**
   * The files a first import can't go ahead without, each matched against the chosen files' names whatever their
   *  case: the interface's pack's. Another pack's are optional, and its files can be imported on their own once the
   *  interface's sprites are all in.
   */
  requiredFiles: string[];
  /** Whether `file` is one of the files it reads, by its name, whatever its case. */
  accepts(file: ChosenFile): boolean;
  /** Whether `file` is one of its own that it takes and leaves alone (Civ2's RULES.TXT), rather than one none reads. */
  ignores?(file: ChosenFile): boolean;
  /** What the window's instructions say of its files. */
  instructions(): string;
  /**
   * Reads `files`, each one it `accepts`, and cuts out the sprites wanted, as the records to store. Rejects with an
   *  `UnsupportedFile` naming one that can't be read, unless it is left out (`skipUnreadable`).
   */
  import(files: File[], options: ImportOptions): Promise<PackImportResult>;
  /**
   * What the window says of the pack's import as it opens, with nothing `skipped`, and after one that read any of its
   *  files: nothing, for a pack with nothing to say. An incomplete one leaves the page for the player to reload.
   */
  status?(skipped: string[]): Promise<PackImportStatus>;
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

/** Whether the import needs `pack`'s files: whether it has `requiredFiles`. */
export const isNeeded = ({ requiredFiles }: PackImport): boolean =>
  requiredFiles.length > 0;

const registered: PackImport[] = [];

/** Lets the Import Assets window import `pack`'s files: its package calls this as it is loaded. Once per pack id. */
export const registerPackImport = (pack: PackImport): void => {
  if (registered.some(({ id }) => id === pack.id)) {
    throw new Error(`An import for "${pack.id}" is registered already.`);
  }

  registered.push(pack);
};

/** Every pack's import: the ones the import needs (`isNeeded`) first, then the rest, each as they were registered. */
export const packImports = (): PackImport[] => [
  ...registered.filter(isNeeded),
  ...registered.filter((pack) => !isNeeded(pack)),
];

/** The pack whose import reads `file`, if any does. */
export const packImportFor = (file: ChosenFile): PackImport | undefined =>
  packImports().find((pack) => pack.accepts(file));
