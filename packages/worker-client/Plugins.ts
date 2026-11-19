// The rules a game is played with (#825): the page's worker entry says which, so the worker client knows no ruleset of
//  its own. civ.one's are its plugin sets (#668), which `buildPluginList.js` writes to `src/js/pluginSets.ts`, and
//  another build or a test can hand in its own.

/** Each plugin package and its version, as a save records them and a load checks them against. */
export type PluginManifest = { [name: string]: string };

/** One set of plugins a game can be played with (#668): `civ1`, `civ1-enhanced`… */
export type PluginSet = {
  id: string;
  /** The set's plugins and their versions, which a game played with it saves, and a load checks against. */
  manifest: PluginManifest;
  /**
   * A set a game can be played with, and a save can name, that the page doesn't offer unless one of the art packs it
   *  names (`tilesets`) is installed.
   */
  hidden: boolean;
  /**
   * The art packs its games are drawn with, by tileset id, in the order it prefers them: the first the page has is
   *  the one it's drawn with, on that pack's grid. Civ2's are its own art, which the player imports from their own
   *  copy, then civ.one's isometric pixel art. The page offers the set only once one of them is installed. Empty for a
   *  set drawn with whatever the player picks.
   */
  tilesets: string[];
  /**
   * The set that plays the same game as the original plays it, when this one is that game with its fixes (#1248): the
   *  setup offers the two as one game, with Original and Enhanced rules. Null for a set that is a game of its own.
   */
  original: string | null;
  /** Imports the set's plugins, which registers their rules: resolves once they are all in. Once is enough. */
  load: () => Promise<unknown>;
};

export type Plugins = {
  sets: PluginSet[];
  /** The set a new game is played with, unless another is chosen. */
  default: string;
  /**
   * The set a save that names none loads with: every save made before there were sets, when every plugin installed
   *  was loaded. A setting of its own, so that a new default doesn't change how an old game plays.
   */
  withoutOne: string;
};

/** The sets as `buildPluginList.js` writes them: what each loads, in order, and a loader for each plugin. */
export type PluginSetData = {
  loaders: { [name: string]: () => Promise<unknown> };
  sets: {
    id: string;
    /** In the order they load, by package name (#474). */
    plugins: string[];
    /** The set's worker rules (#865), loaded after its plugins, as they register AdditionalData for their classes. */
    rules: string;
    /** Not offered by the page (`civ-clone.sets.<id>.hidden`); offered when left out. */
    hidden?: boolean;
    /** The art packs its games are drawn with, in the order it prefers them (`civ-clone.sets.<id>.tileset`). */
    tilesets?: string[];
    /** The set it is the enhanced rules of (`civ-clone.sets.<id>.original`), when it is. */
    original?: string | null;
    manifest: PluginManifest;
  }[];
  default: string;
  withoutOne: string;
};

/**
 * The sets, each loading its plugins one at a time in their order, then its worker rules: a plugin registers its rules
 *  as it is imported, and rules at the same priority run in the order they were registered, so the order is part of
 *  how the game plays. Only what is loaded runs: a plugin in no set chosen is never imported.
 */
export const pluginsFrom = (data: PluginSetData): Plugins => ({
  sets: data.sets.map(
    ({
      id,
      plugins,
      rules,
      hidden,
      tilesets,
      original,
      manifest,
    }): PluginSet => {
      let loading: Promise<unknown> | null = null;

      return {
        id,
        manifest,
        hidden: hidden === true,
        tilesets: Array.isArray(tilesets) ? [...tilesets] : [],
        original: typeof original === 'string' ? original : null,
        load: (): Promise<unknown> => {
          if (loading === null) {
            loading = [...plugins, rules].reduce(
              (previous: Promise<unknown>, name: string) =>
                previous.then(() => {
                  const loader = data.loaders[name];

                  if (loader === undefined) {
                    throw new Error(
                      `The ${id} plugins have no loader for ${name}.`
                    );
                  }

                  return loader();
                }),
              Promise.resolve()
            );
          }

          return loading;
        },
      };
    }
  ),
  default: data.default,
  withoutOne: data.withoutOne,
});

/**
 * The art `set` is drawn with on a page with the art packs `tilesets` (by id): the first of its own that the page has,
 *  or null for a set drawn with whatever the player picks, or one with none of its art there.
 */
export const drawnWith = (
  { tilesets: own }: Pick<PluginSet, 'tilesets'>,
  tilesets: string[] = []
): string | null => own.find((id) => tilesets.includes(id)) ?? null;

/**
 * Whether the page may offer `set` for a new game, given the art packs it has installed (`tilesets`, by id): a set
 *  drawn with art packs of its own once one of them is there, and any other unless it's hidden.
 */
export const isOffered = (
  set: Pick<PluginSet, 'hidden' | 'tilesets'>,
  tilesets: string[] = []
): boolean =>
  set.tilesets.length === 0 ? !set.hidden : drawnWith(set, tilesets) !== null;

/**
 * The sets the page may offer for a new game, in their order: with no art packs named, every one that isn't hidden and
 *  needs no art of its own. Civ2's is offered to a page that has Civ2's art or civ.one's isometric pixel art.
 */
export const offeredSets = (
  plugins: Plugins,
  tilesets: string[] = []
): PluginSet[] => plugins.sets.filter((set) => isOffered(set, tilesets));
