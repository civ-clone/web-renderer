// civ.one's plugins, as its worker entry (`src/js/backend.ts`) hands them to `Game` (#825): every installed plugin, which
//  `buildPluginList.js` lists. Imported statically, so they are in before a suite's own code runs, after `Game`'s
//  imports, as `backend.ts` has them.
import { Plugins } from '@civ-clone/ui-worker-client/Plugins';
import { plugins } from '../../../src/js/plugins';

export const civOnePlugins: Plugins = {
  manifest: plugins,
  load: () => import('../../../src/js/plugins'),
};

export default civOnePlugins;
