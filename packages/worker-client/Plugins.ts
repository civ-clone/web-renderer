// The rules a game is played with (#825): the page's worker entry says which, so the worker client knows no ruleset of
//  its own. civ.one's are every plugin installed (`buildPluginList.js` writes `src/js/plugins.ts`), and another build or
//  a test can hand in its own.
export type Plugins = {
  /** Each plugin package and its version, as a save records them and a load checks them against. */
  manifest: { [name: string]: string };
  /** Imports the plugins, which registers their rules: resolves once they are all in. */
  load: () => Promise<unknown>;
};
