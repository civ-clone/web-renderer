// Where each hosted set's sheet and index are (#1063), by set id: `sheets.js`, which `tools/lib/hostedSets.js` writes
//  beside this as the build, `watch` and the suites start, from what this package declares in its `package.json`
//  (`civ-clone.hostedSets`).
import { HostedSheet } from '@civ-clone/ui-assets/lib/packs';

export declare const sheets: { [id: string]: HostedSheet };

export default sheets;
