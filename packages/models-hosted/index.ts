// The sets of models that ship with civ.one for the 3D map (docs/3d-renderer.md §10), beside the game: 0 A.D.'s ancient
//  units, converted from 0 A.D.'s art by Wildfire Games (civ-clone/models-0ad, CC BY-SA 3.0), and realistic units, in
//  two sets by their licence: those made for civ.one (civ-clone/models-realistic-cc0, CC0 1.0), and those mostly
//  adapted from their authors' on Sketchfab (civ-clone/models-realistic-by, CC BY 4.0). Under `?3d=1` the map draws
//  each unit type one of them has a model for with it, unless the page asks for another set (`?models=`); the library
//  shows each with its licence and the credit it gives.

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

/** A set that ships with civ.one, by its id. */
export type ShippedModelSet = HostedModelSet & { id: string };

const shipped = (id: string): ShippedModelSet => ({ id, ...modelSets[id]! });

/** 0 A.D.'s ancient units. */
export const ancientUnits: ShippedModelSet = shipped('0ad-ancient');

/** Realistic units made for civ.one, under CC0. */
export const realisticUnits: ShippedModelSet = shipped('realistic-cc0');

/** Realistic units adapted from their authors', under CC BY: its credit links each author's. */
export const creditedUnits: ShippedModelSet = shipped('realistic-by');

/**
 * Every set that ships with civ.one, in the order the 3D map takes them: a unit type is drawn by the first that has a
 *  model for it. None draws a type another does.
 */
export const hostedModelSets: readonly ShippedModelSet[] = [
  ancientUnits,
  realisticUnits,
  creditedUnits,
];

export default hostedModelSets;
