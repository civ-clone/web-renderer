// civ.one's plugins for the suites that play a game through `Game` (#825): its default set, civ1-enhanced (#668),
//  which `src/js/plugins.ts` imports statically, so they are in before a suite's own code runs, after `Game`'s imports,
//  as `backend.ts` once had them. The only set offered: the others can't be loaded on top of it. A suite that plays
//  another set loads it from `src/js/pluginSets.ts` instead, and never imports this.
import { Plugins } from '@civ-clone/ui-worker-client/Plugins';
import pluginSets from '../../../src/js/pluginSets';
import { plugins } from '../../../src/js/plugins';

/** The default set's plugins and their versions, as a game played with it saves them. */
export const civOneManifest = plugins;

export const civOnePlugins: Plugins = {
  sets: [
    {
      id: pluginSets.default,
      manifest: civOneManifest,
      load: () => import('../../../src/js/plugins'),
    },
  ],
  default: pluginSets.default,
  withoutOne: pluginSets.withoutOne,
};

export default civOnePlugins;
