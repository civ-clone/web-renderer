// Where each hosted set of models' manifest is (docs/3d-renderer.md §10), and what the library shows of it, by set id:
//  `modelSets.js`, which `tools/lib/hostedSets.js` writes beside this as the build, `watch` and the suites start, from
//  what this package declares in its `package.json` (`civ-clone.hostedModels`).
import { HostedModelSet } from './index';

export declare const modelSets: { [id: string]: HostedModelSet };

export default modelSets;
