// Which interface is in use (#735), each described by a manifest (#824) and registered by its own package in
//  `interfaces/` (#825): which implementation fills each slot, which
//  features it has, and the theme it comes with. `#167`'s themes carry no layout; an interface does, and names one.
//  The `interface` option says which, kept like the others; `?interface=` says for one visit.
//
// A slot is a part of the interface that has more than one implementation. A family of components defines one with
//  `defineSlot` where it is put together, and provides what it has; the manifest picks. A feature is a behaviour inside
//  a shared component that an interface either has or doesn't, read with `hasFeature`. Nothing but Options, which
//  offers the choice, needs to know which interface is in use.
//
// Every slot and feature is named here (#861), so a name that isn't one fails to compile, and a manifest that names one
//  that isn't is refused.

export type InterfaceMode = string;

/** The slots, each defined once where its family of components is put together, and filled by every manifest. */
export const SLOTS = [
  'titleScreen',
  'cityLabels',
  'cityScreen',
  'reports',
  'choices',
  'choiceList',
  'unitPanel',
  'talks',
  'mapMenus',
  'turnControls',
  'windowChrome',
] as const;

export type SlotName = (typeof SLOTS)[number];

/** The features, each a behaviour inside a shared component that a manifest either lists or doesn't. */
export const FEATURES = ['assetsInOptions', 'squareTooltips'] as const;

export type FeatureName = (typeof FEATURES)[number];

export interface InterfaceManifest {
  schema: number;
  id: InterfaceMode;
  // The translation key of the name Options shows.
  name: string;
  // The theme it comes with, which the player's own choice of theme outranks.
  theme: string;
  // Which of a slot's implementations to use, by the slot's name: every slot, and nothing else.
  slots: { [slot in SlotName]: string };
  features: FeatureName[];
  // The ids it had before it was renamed, so a stored choice or an old link still finds it.
  formerly?: InterfaceMode[];
}

const manifests = new Map<InterfaceMode, InterfaceManifest>();

const SCHEMA = 1;

const isSlotName = (value: unknown): value is SlotName =>
    (SLOTS as readonly unknown[]).includes(value),
  isFeatureName = (value: unknown): value is FeatureName =>
    (FEATURES as readonly unknown[]).includes(value);

const isManifest = (value: any): value is InterfaceManifest =>
  value?.schema === SCHEMA &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.theme === 'string' &&
  typeof value.slots === 'object' &&
  value.slots !== null &&
  !Array.isArray(value.slots) &&
  Object.keys(value.slots).every(isSlotName) &&
  SLOTS.every((slot) => typeof value.slots[slot] === 'string') &&
  Array.isArray(value.features) &&
  value.features.every(isFeatureName) &&
  (value.formerly === undefined ||
    (Array.isArray(value.formerly) &&
      value.formerly.every((id: unknown) => typeof id === 'string')));

/** Makes an interface available, replacing any with the same `id`. A manifest may come from outside, so it's checked. */
export const registerInterface = (manifest: unknown): void => {
  if (!isManifest(manifest)) {
    throw new TypeError(
      `Not an interface manifest: ${JSON.stringify(manifest)}`
    );
  }

  manifests.set(manifest.id, manifest);
};

/** The interface used when nothing names another: the first registered, as `src/js/interfaces.ts` lists them. */
export const defaultInterface = (): InterfaceMode => {
  const [first] = manifests.keys();

  if (first === undefined) {
    throw new TypeError(
      "No interface is registered: the page's entry imports `UI/interfaces`, and a test suite `tests/ui/lib/interfaces`."
    );
  }

  return first;
};

// Until the page applies one, the default.
let mode: InterfaceMode | null = null,
  // What the player last chose, which differs from `mode` until the page next loads: the interface can't change under
  //  a game in play.
  chosen: InterfaceMode | null = null;

const inUse = (): InterfaceMode => mode ?? defaultInterface();

const isInterface = (value: unknown): value is InterfaceMode =>
  manifests.has(value as InterfaceMode);

// What the page loaded with: its own copy, so registering a replacement for it waits for the next load, like a choice.
let active: InterfaceManifest | null = null;

const copyOf = (manifest: InterfaceManifest): InterfaceManifest => ({
  ...manifest,
  slots: { ...manifest.slots },
  features: [...manifest.features],
});

// An id an interface had before, as the first registered that had it lists it, is that interface's id now.
const renamed = (value: unknown): unknown =>
  typeof value === 'string' && !manifests.has(value)
    ? [...manifests.values()].find(({ formerly = [] }) =>
        formerly.includes(value)
      )?.id ?? value
    : value;

/** The interfaces to choose from. */
export const interfaces = (): InterfaceManifest[] => [...manifests.values()];

/** The interface in use. */
export const interfaceMode = (): InterfaceMode => inUse();

/** The manifest of the interface in use. */
export const currentInterface = (): InterfaceManifest => {
  const manifest = active ?? manifests.get(inUse());

  if (manifest === undefined) {
    throw new TypeError(
      `No interface '${inUse()}' is registered: the page's entry imports \`UI/interfaces\`, and a test suite \`tests/ui/lib/interfaces\`.`
    );
  }

  return manifest;
};

/** Whether the interface in use has `feature`. */
export const hasFeature = (feature: FeatureName): boolean =>
  currentInterface().features.includes(feature);

export interface Slot<Implementation> {
  /** Adds an implementation, for a manifest to name. */
  provide(name: string, implementation: Implementation): void;
  /** The implementation the interface in use names. */
  current(): Implementation;
}

// The slots defined so far, for a test to hold against `SLOTS`.
const defined = new Set<SlotName>();

/** The slots that have been defined: once everything that defines one has loaded, every one in `SLOTS`. */
export const definedSlots = (): SlotName[] => [...defined];

/** A part of the interface that manifests fill: `name` is its key in their `slots`. */
export const defineSlot = <Implementation>(
  name: SlotName
): Slot<Implementation> => {
  const implementations = new Map<string, Implementation>();

  defined.add(name);

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
export const chosenInterface = (): InterfaceMode => chosen ?? inUse();

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

  const applied = isInterface(param)
    ? param
    : isInterface(option)
    ? option
    : defaultInterface();

  mode = applied;
  chosen = applied;
  active = copyOf(manifests.get(applied)!);

  root.setAttribute('data-interface', applied);

  return applied;
};

export default interfaceMode;
