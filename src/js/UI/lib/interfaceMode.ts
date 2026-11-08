// Which interface is in use (#735), each described by a manifest (#824) and registered by its own package in
//  `interfaces/` (#825): which implementation fills each slot, which
//  features it has, and the theme it comes with. `#167`'s themes carry no layout; an interface does, and names one.
//  The `interface` option says which, kept like the others; `?interface=` says for one visit.
//
// A slot is a part of the interface that has more than one implementation. A family of components defines one with
//  `defineSlot` where it is put together, and provides what it has; the manifest picks. A feature is a behaviour inside
//  a shared component that an interface either has or doesn't, read with `hasFeature`. Nothing but Options, which
//  offers the choice, needs to know which interface is in use.

export type InterfaceMode = string;

export interface InterfaceManifest {
  schema: number;
  id: InterfaceMode;
  // The translation key of the name Options shows.
  name: string;
  // The theme it comes with, which the player's own choice of theme outranks.
  theme: string;
  // Which of a slot's implementations to use, by the slot's name.
  slots: { [slot: string]: string };
  features: string[];
}

export const DEFAULT_INTERFACE: InterfaceMode = 'modern';

// Interfaces that have been renamed, so a stored choice or an old link still finds them.
const RENAMED: { [id: string]: InterfaceMode } = { new: 'modern' };

const manifests = new Map<InterfaceMode, InterfaceManifest>();

const SCHEMA = 1;

const isManifest = (value: any): value is InterfaceManifest =>
  value?.schema === SCHEMA &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.theme === 'string' &&
  typeof value.slots === 'object' &&
  value.slots !== null &&
  !Array.isArray(value.slots) &&
  Object.values(value.slots).every((slot) => typeof slot === 'string') &&
  Array.isArray(value.features) &&
  value.features.every((feature: unknown) => typeof feature === 'string');

/** Makes an interface available, replacing any with the same `id`. A manifest may come from outside, so it's checked. */
export const registerInterface = (manifest: unknown): void => {
  if (!isManifest(manifest)) {
    throw new TypeError(
      `Not an interface manifest: ${JSON.stringify(manifest)}`
    );
  }

  manifests.set(manifest.id, manifest);
};

let mode: InterfaceMode = DEFAULT_INTERFACE,
  // What the player last chose, which differs from `mode` until the page next loads: the interface can't change under
  //  a game in play.
  chosen: InterfaceMode = mode;

const isInterface = (value: unknown): value is InterfaceMode =>
  manifests.has(value as InterfaceMode);

// What the page loaded with: its own copy, so registering a replacement for it waits for the next load, like a choice.
let active: InterfaceManifest | null = null;

const copyOf = (manifest: InterfaceManifest): InterfaceManifest => ({
  ...manifest,
  slots: { ...manifest.slots },
  features: [...manifest.features],
});

const renamed = (value: unknown): unknown =>
  typeof value === 'string' && value in RENAMED ? RENAMED[value] : value;

/** The interfaces to choose from. */
export const interfaces = (): InterfaceManifest[] => [...manifests.values()];

/** The interface in use. */
export const interfaceMode = (): InterfaceMode => mode;

/** The manifest of the interface in use. */
export const currentInterface = (): InterfaceManifest =>
  active ?? (manifests.get(mode) as InterfaceManifest);

/** Whether the interface in use has `feature`. */
export const hasFeature = (feature: string): boolean =>
  currentInterface().features.includes(feature);

export interface Slot<Implementation> {
  /** Adds an implementation, for a manifest to name. */
  provide(name: string, implementation: Implementation): void;
  /** The implementation the interface in use names. */
  current(): Implementation;
}

/** A part of the interface that manifests fill: `name` is its key in their `slots`. */
export const defineSlot = <Implementation>(
  name: string
): Slot<Implementation> => {
  const implementations = new Map<string, Implementation>();

  return {
    provide: (implementationName, implementation) => {
      implementations.set(implementationName, implementation);
    },
    current: () => {
      const { id, slots } = currentInterface(),
        implementationName = slots[name];

      if (!implementations.has(implementationName)) {
        throw new TypeError(
          `Interface '${id}' fills slot '${name}' with '${implementationName}', which nothing provides.`
        );
      }

      return implementations.get(implementationName) as Implementation;
    },
  };
};

/** The interface the next page load will use. */
export const chosenInterface = (): InterfaceMode => chosen;

/** Remembers the player's choice, for `chosenInterface`. The `interface` option is what keeps it. */
export const chooseInterface = (choice: InterfaceMode): void => {
  chosen = choice;
};

/**
 * Sets the interface from the visit's `?interface=` when it names one, or else the `interface` option, and says which
 *  on `<html>` as `data-interface`. Anything else is ignored.
 */
export const applyInterface = (
  param: string | null,
  option: unknown,
  root: HTMLElement = document.documentElement
): InterfaceMode => {
  param = renamed(param) as string | null;
  option = renamed(option);

  mode = isInterface(param)
    ? param
    : isInterface(option)
    ? option
    : DEFAULT_INTERFACE;
  chosen = mode;
  active = isInterface(mode) ? copyOf(manifests.get(mode)!) : null;

  root.setAttribute('data-interface', mode);

  return mode;
};

export default interfaceMode;
