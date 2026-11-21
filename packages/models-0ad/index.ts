// 0 A.D.'s ancient units for the 3D map (docs/3d-renderer.md §10): a set of models converted from 0 A.D.'s art by
//  Wildfire Games (civ-clone/models-0ad, CC BY-SA 3.0), which ships with civ.one beside the game. Under `?3d=1` the map
//  draws each unit type it has a model for with it, unless the page asks for another set (`?models=`); the library
//  shows it with its licence and the credit it asks for.

import modelSets from './modelSets';

/** A licence by name and link, and the credit it asks for wherever the set's used, as a set's manifest says it. */
export type HostedModelLicence = {
  name: string;
  url: string;
  attribution?: string;
};

/**
 * A set of models that ships with civ.one: where its manifest is, beside the page, and what the library shows of it
 *  (as `@civ-clone/ui-map-3d/models/modelSet` reads them: the page imports nothing of the 3D map).
 */
export type HostedModelSet = {
  manifest: string;
  name: string;
  licence: HostedModelLicence;
  credits: {
    work: string;
    author: string;
    url: string;
    licence: HostedModelLicence;
  }[];
};

/** 0 A.D.'s ancient units. */
export const ancientUnits: HostedModelSet = modelSets['0ad-ancient']!;

export default ancientUnits;
