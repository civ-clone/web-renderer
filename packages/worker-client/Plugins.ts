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
  sets: data.sets.map(({ id, plugins, rules, manifest }): PluginSet => {
    let loading: Promise<unknown> | null = null;

    return {
      id,
      manifest,
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
  }),
  default: data.default,
  withoutOne: data.withoutOne,
});
