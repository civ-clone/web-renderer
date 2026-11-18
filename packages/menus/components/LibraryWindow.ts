import {
  PackImport,
  filesNeeded,
  packImportOf,
} from '@civ-clone/ui-assets/lib/packImports';
import {
  SetLicence,
  SetSource,
} from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import { TilesetDescriptor } from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import {
  bundledTilesets,
  hiddenGrids,
  installedTilesets,
  isHosted,
  mapTileset,
  ruleSetMapTileset,
} from '@civ-clone/ui-assets/lib/tilesets';
import {
  currentUiTheme,
  uiThemeArt,
  uiThemes,
} from '@civ-clone/ui-widgets/lib/theme';
import {
  hasInstalledInterfaceArt,
  interfaceArt,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import Window, { WindowOptions } from '@civ-clone/ui-component-window/Window';
import ImportAssetsWindow from './ImportAssetsWindow';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import { loadFailed, useMapArt } from '@civ-clone/ui-assets/lib/installPacks';
import { button } from '@civ-clone/ui-component-button/button';
import chooseUiTheme from '../lib/chooseUiTheme';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { s } from '@dom111/element';
import { soundSets } from '@civ-clone/ui-assets/sounds/SoundDescriptor';
import i18next, { t } from 'i18next';
// Civilization's music, a set of its own: registered wherever the library can open.
import '../lib/civ1Sound';

// The library of art and sound (#1063): every set the game can draw or play with, by what it is for (the map's art by
//  grid, the interface's themes, the sound), saying where each comes from, whether it's ready, and opening its import.
//  It replaces Import assets: the imports are each set's own (`ImportAssetsWindow`), in any order (#1063). It opens
//  before a game (the main menus, and Options) and during one (the game's menu, and Options, #1118). During a game the
//  map is drawn with the art chosen for its grid at once, and a theme with other interface art carries the game over to
//  a new page (`chooseUiTheme`); but nothing is imported, as an import loads the page again, which would lose the
//  game.

/**
 * A set as the library lists it: its manifest's head, what it gives the game, the grid it draws maps on if it does,
 *  and its import if it has one.
 */
interface LibrarySet {
  id: string;
  name: string;
  grid?: string;
  source?: SetSource;
  licence?: SetLicence;
  provides: string[];
  pack?: PackImport;
}

/** A set with an import, and the parts of its entry that change: its status and its button. */
interface Entry {
  pack: PackImport;
  status: HTMLElement;
  importButton: HTMLButtonElement;
}

/** A theme's entry, and the parts of it that change with the theme in use. */
interface ThemeEntry {
  id: string;
  status: HTMLElement;
  use: HTMLButtonElement;
}

/** A map set's Use for its grid, and what marks it as the one in use. */
interface MapUseEntry {
  id: string;
  grid: string;
  inUse: HTMLElement;
  use: HTMLButtonElement;
}

/**
 * Whose interface art the theme `id` draws with now (#1063), as its entry says it: Civilization's, say, when it's
 *  imported, or civ.one's pixel art when it isn't. A set that ships with civ.one may have words of its own
 *  (`LibraryWindow.theme-art.<id>`); one imported is named by the game it comes from.
 */
export const themeArtLine = (id: string): string => {
  const art = uiThemeArt(id);

  if (!hasInstalledInterfaceArt(art)) {
    return t('LibraryWindow.theme-art.none');
  }

  const tileset: TilesetDescriptor = interfaceArt(art),
    pack = packImportOf(tileset.id);

  if (!isHosted(tileset) && pack !== undefined) {
    return t('LibraryWindow.theme-art.imported', {
      game: pack.game(),
      interpolation: { escapeValue: false },
    });
  }

  return t(
    [`LibraryWindow.theme-art.${tileset.id}`, 'LibraryWindow.theme-art.set'],
    {
      name: tileset.name,
      interpolation: { escapeValue: false },
    }
  );
};

/** What the library says of a set's state: Ready, Needs …, or Not imported, and which of those it is. */
export interface SetStatus {
  state: 'ready' | 'needs' | 'not-imported';
  text: string;
}

/**
 * What `pack`'s set is, as its entry says it, from whether it's ready and the files it still wants: the required ones
 *  as its import window asks for them (`filesNeeded`).
 */
export const setStatus = async (pack: PackImport): Promise<SetStatus> => {
  const [ready, wanted, needed] = await Promise.all([
      pack.ready(),
      pack.filesWanted(),
      filesNeeded(pack),
    ]),
    optional =
      wanted !== null && wanted.optional.length > 0
        ? [t('LibraryWindow.status.optional', { files: wanted.optional })]
        : [];

  if (ready) {
    return {
      state: 'ready',
      text: [t('LibraryWindow.status.ready'), ...optional].join(' · '),
    };
  }

  if (wanted === null) {
    return { state: 'not-imported', text: t('LibraryWindow.status.none') };
  }

  return {
    state: 'needs',
    text: [
      t('LibraryWindow.status.needs', { files: needed }),
      ...optional,
    ].join(' · '),
  };
};

/**
 * The sets with art for the map, by grid, in the order the grids' first sets were registered: but a grid new games
 *  don't offer yet (`hiddenGrids`, hex without `?hex=1`), whose sets aren't listed.
 */
const mapSets = (): [string, LibrarySet[]][] => {
  const grids = new Map<string, LibrarySet[]>(),
    hidden: string[] = hiddenGrids();

  bundledTilesets()
    .filter(({ grid }) => !hidden.includes(grid))
    .forEach(({ id, name, grid, source, licence, assets }) =>
      grids.set(grid, [
        ...(grids.get(grid) ?? []),
        {
          id,
          name,
          grid,
          source,
          licence,
          provides: [
            t('LibraryWindow.provides.map', { grid: t(`Grid.${grid}`) }),
            ...(assets.ui.length > 0
              ? [t('LibraryWindow.provides.interface')]
              : []),
          ],
          pack: packImportOf(id),
        },
      ])
    );

  return [...grids.entries()];
};

/** The sets of sound. */
const soundLibrarySets = (): LibrarySet[] =>
  soundSets().map(({ id, name, source, licence }) => ({
    id,
    name,
    source,
    licence,
    provides: [t('LibraryWindow.provides.music')],
    pack: packImportOf(id),
  }));

/** Whether `url` is an https: address. */
const isHttps = (url: string): boolean => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};

/** Where `set` comes from: the player's own copy of a game, or civ.one, and its licence when it has one. */
const sourceOf = ({ source, licence, pack }: LibrarySet): HTMLElement => {
  const element = s<HTMLDivElement>('<div class="source"></div>');

  if (source === 'hosted') {
    element.append(t('LibraryWindow.hosted'));
  }

  if (source === 'imported' && pack !== undefined) {
    element.append(
      t('LibraryWindow.imported', {
        game: pack.game(),
        interpolation: { escapeValue: false },
      })
    );
  }

  if (licence !== undefined) {
    // Set as text and as an attribute: a manifest's words aren't markup. A link only to an https: page; any other
    //  address (javascript:, say) is shown as the licence's name alone.
    const linked = isHttps(licence.url),
      link = linked
        ? s<HTMLAnchorElement>(
            '<a target="_blank" rel="noopener noreferrer"></a>'
          )
        : s<HTMLSpanElement>('<span class="licence-name"></span>');

    if (linked) {
      (link as HTMLAnchorElement).href = licence.url;
    }

    link.textContent = licence.name;

    element.append(
      ...(element.childNodes.length > 0 ? [' · '] : []),
      t('LibraryWindow.licence'),
      ' ',
      link,
      ...(licence.attribution === undefined ? [] : [' · ', licence.attribution])
    );
  }

  return element;
};

/**
 * `set`'s Use for the `grid` grid's maps (#1063), named for the set, and what marks it as the one in use. Choosing it
 *  keeps it as the art for that grid once it's ready to draw from (`useMapArt`), as a game on that grid draws with it
 *  at once (#1118), and calls `chosen`; or, when it can't be loaded, `failed`. The one in use is out of use but kept in
 *  the tab order, so focus stays on it once it's chosen.
 */
// The latest Use for each grid (#1118): a sheet still loading for an earlier one is never chosen over it.
const latestUse = new Map<string, number>();

const mapUse = (
  { id, name }: LibrarySet,
  grid: string,
  chosen: () => void,
  failed: (error: unknown) => void
): MapUseEntry => {
  // A grid's name is a common noun, lower case within a sentence: "Use for square maps".
  const gridName = t(`Grid.${grid}`).toLocaleLowerCase(i18next.language),
    inUse = s<HTMLElement>(
      `<span class="status in-use" data-state="ready" aria-live="polite" hidden>${t(
        'LibraryWindow.in-use-for-grid',
        { grid: gridName }
      )}</span>`
    ),
    use = h(button(t('LibraryWindow.use-for-grid', { grid: gridName })), {
      click: (): void => {
        if (
          use.getAttribute('aria-disabled') === 'true' ||
          use.getAttribute('aria-busy') === 'true'
        ) {
          return;
        }

        // A hosted set's sheet may be fetched first: one click, while it is, and only the latest Use for the grid is
        //  chosen once it's there.
        const request = (latestUse.get(grid) ?? 0) + 1;

        latestUse.set(grid, request);
        use.setAttribute('aria-busy', 'true');

        useMapArt(grid, id, undefined, () => latestUse.get(grid) === request)
          .then(chosen, failed)
          .finally(() => use.removeAttribute('aria-busy'));
      },
    });

  use.setAttribute(
    'aria-label',
    t('LibraryWindow.use-set-for-grid', {
      name,
      grid: gridName,
      interpolation: { escapeValue: false },
    })
  );

  return { id, grid, inUse, use };
};

export class LibraryWindow extends Window {
  #entries: Entry[];
  #themes: ThemeEntry[] = [];
  #mapUses: MapUseEntry[];
  #storageBlocked: HTMLDivElement;
  // Over Options, which is modal before a game: the import it opens must be too, or it would open behind it.
  #modal: boolean;
  // During a game (#1118): nothing is imported, and a theme with other art carries the game over to a new page.
  #inGame: boolean;
  // Said when a theme's art waits for the next load: it couldn't be carried over now (waiting for the turn, say).
  #themeHint: HTMLParagraphElement;

  constructor(
    windowOptions: WindowOptions = {},
    { inGame = false }: { inGame?: boolean } = {}
  ) {
    const storageBlocked = s<HTMLDivElement>(
        '<div class="storage-blocked" role="alert" hidden></div>'
      ),
      // Why nothing can be imported during a game: said once, above everything, as the storage's reason is.
      importsInGame = s<HTMLParagraphElement>(
        `<p class="hint imports-in-game"${inGame ? '' : ' hidden'}>${t(
          'LibraryWindow.import-in-game'
        )}</p>`
      ),
      themeHint = s<HTMLParagraphElement>(
        `<p class="hint" aria-live="polite" hidden>${t(
          'GameOptions.theme-art-next-load'
        )}</p>`
      ),
      themes = s<HTMLUListElement>('<ul class="library-sets"></ul>'),
      entries: Entry[] = [],
      mapUses: MapUseEntry[] = [],
      // Each installed map set's Use for its grid (#1063): only one there is to draw with can be chosen.
      installed = installedTilesets().map(({ id }) => id),
      // The entry for `set`, its import's parts kept for `refresh` to fill in.
      entry = (set: LibrarySet): HTMLElement => {
        const name = s<HTMLElement>('<strong class="name"></strong>'),
          // Said as it changes, once the store has answered and after an import.
          status = s<HTMLElement>(
            '<span class="status" aria-live="polite"></span>'
          ),
          element = s<HTMLLIElement>(
            '<li class="library-set"></li>',
            s('<div class="library-set-head"></div>', name, status),
            s(
              '<div class="provides"></div>',
              ...set.provides.map((provides) => s(`<span>${provides}</span>`))
            ),
            sourceOf(set)
          );

        element.dataset.set = set.id;
        name.textContent = set.name;

        // A set that ships with civ.one is ready unless fetching its sheet failed (#1063), offline on a first visit: at
        //  start-up, when it's left uninstalled, or as a game on its grid started. One not fetched yet, as its sheet is
        //  only fetched once it's drawn from, is there until it's tried. Only a map set's sheet is fetched so far.
        if (set.source === 'hosted') {
          const loaded =
            set.grid === undefined ||
            (installed.includes(set.id) && !loadFailed(set));

          status.textContent = t(
            loaded
              ? 'LibraryWindow.status.ready'
              : 'LibraryWindow.status.unloaded'
          );
          status.dataset.state = loaded ? 'ready' : 'needs';
        }

        const actions = s<HTMLElement>('<div class="actions"></div>');

        if (set.grid !== undefined && installed.includes(set.id)) {
          const use = mapUse(
            set,
            set.grid,
            // Ready again, if a try before had failed.
            (): void => {
              status.textContent = t('LibraryWindow.status.ready');
              status.dataset.state = 'ready';

              this.#markMapUses();
            },
            // Its sheet couldn't be fetched (offline, say): the map stays as it was, and its entry says why.
            (error): void => {
              console.error(error);

              status.textContent = t('LibraryWindow.status.unloaded');
              status.dataset.state = 'needs';
            }
          );

          mapUses.push(use);
          actions.append(use.use, use.inUse);
        }

        const pack = set.pack;

        if (pack === undefined) {
          if (actions.childNodes.length > 0) {
            element.append(actions);
          }

          return element;
        }

        // Disabled until the store says whether it can be imported.
        const importButton = h(
          button(t('LibraryWindow.import'), { disabled: true }),
          {
            click: () => this.#openImport(pack),
          }
        );

        // Named for its set.
        importButton.setAttribute(
          'aria-label',
          t('LibraryWindow.import-set', {
            name: set.name,
            interpolation: { escapeValue: false },
          })
        );

        entries.push({ pack, status, importButton });

        actions.prepend(importButton);
        element.append(actions);

        return element;
      };

    super(
      t('LibraryWindow.title'),
      s(
        '<div class="library"></div>',
        storageBlocked,
        importsInGame,
        s(
          '<section class="library-section" data-section="map"></section>',
          s(`<h4>${t('LibraryWindow.map')}</h4>`),
          ...mapSets().flatMap(([grid, sets]) => [
            s(`<h5>${t(`Grid.${grid}`)}</h5>`),
            s('<ul class="library-sets"></ul>', ...sets.map(entry)),
          ])
        ),
        s(
          '<section class="library-section" data-section="themes"></section>',
          s(`<h4>${t('LibraryWindow.themes')}</h4>`),
          themes,
          themeHint
        ),
        s(
          '<section class="library-section" data-section="sound"></section>',
          s(`<h4>${t('LibraryWindow.sound')}</h4>`),
          s('<ul class="library-sets"></ul>', ...soundLibrarySets().map(entry))
        )
      ),
      windowOptions
    );

    this.#entries = entries;
    this.#mapUses = mapUses;
    this.#storageBlocked = storageBlocked;
    this.#modal = windowOptions.modal ?? false;
    this.#inGame = inGame;
    this.#themeHint = themeHint;

    this.addClass('library-window');

    themes.append(...this.#themeEntries());
    this.#markThemes();
    this.#markMapUses();

    // A store that can't be read leaves the imports as they were drawn.
    void this.refresh().catch((error) => console.error(error));
  }

  /**
   * Says what each set with an import is (Ready, Needs …, Not imported), and whether they can be imported: not when
   *  the browser keeps nothing for this site (#850). Each set is imported on its own, in any order (#1063): none waits
   *  on Civ1's, as civ.one's own art draws the game without it. As the window opens, and again once an import window
   *  it opened is closed.
   */
  async refresh(): Promise<void> {
    const [usable, statuses] = await Promise.all([
      assetStore.usable(),
      Promise.all(
        this.#entries.map(({ pack }) => setStatus(pack).catch((): null => null))
      ),
    ]);

    this.#storageBlocked.textContent = usable
      ? ''
      : t('ImportAssetsWindow.storage-blocked');
    this.#storageBlocked.toggleAttribute('hidden', usable);

    this.#entries.forEach(({ pack, status, importButton }, index) => {
      const shown = statuses[index] ?? null;

      status.textContent = shown?.text ?? '';

      if (shown === null) {
        delete status.dataset.state;
      } else {
        status.dataset.state = shown.state;
      }

      const again = shown?.state === 'ready';

      importButton.textContent = t(
        again ? 'LibraryWindow.import-again' : 'LibraryWindow.import'
      );
      importButton.setAttribute(
        'aria-label',
        t(
          again ? 'LibraryWindow.import-set-again' : 'LibraryWindow.import-set',
          {
            name: pack.name,
            interpolation: { escapeValue: false },
          }
        )
      );
      // The storage's reason it can't be imported is said once, above everything, as the game's is.
      importButton.disabled = !usable || this.#inGame;
    });
  }

  /** An entry for each theme (#735): its name, whether it's in use, and Use, which chooses it as Options' Theme does. */
  #themeEntries(): HTMLLIElement[] {
    return uiThemes().map(({ id, name }) => {
      const label = s<HTMLElement>('<strong class="name"></strong>'),
        status = s<HTMLElement>(
          `<span class="status" data-state="ready" aria-live="polite">${t(
            'LibraryWindow.in-use'
          )}</span>`
        ),
        use = h(button(t('LibraryWindow.use')), {
          click: (): void => {
            // The theme in use: out of use, but kept in the tab order, so focus stays where it was after choosing.
            if (use.getAttribute('aria-disabled') === 'true') {
              return;
            }

            // New interface art loads the page again: before a game at once, and during one once the game is carried
            //  over to it, or, where it can't be now, at the next load, which the hint says.
            this.#themeHint.hidden = !chooseUiTheme(id, {
              inGame: this.#inGame,
            });
            this.#markThemes();
          },
        }),
        // Whose interface art it draws with now (#1063).
        art = s<HTMLElement>('<div class="art"></div>'),
        element = s<HTMLLIElement>(
          '<li class="library-set"></li>',
          s('<div class="library-set-head"></div>', label, status),
          art,
          s('<div class="actions"></div>', use)
        );

      element.dataset.theme = id;
      art.textContent = themeArtLine(id);
      // The interfaces that bring them register them (#861), so what one says is never treated as markup.
      label.textContent = t(name);
      use.setAttribute(
        'aria-label',
        t('LibraryWindow.use-theme', {
          name: t(name),
          interpolation: { escapeValue: false },
        })
      );

      this.#themes.push({ id, status, use });

      return element;
    });
  }

  /** Marks the theme in use, and puts its Use out of use, leaving the buttons in place so focus stays on the one used. */
  #markThemes(): void {
    const current = currentUiTheme();

    this.#themes.forEach(({ id, status, use }) => {
      const inUse = id === current;

      status.hidden = !inUse;
      use.setAttribute('aria-disabled', String(inUse));
      use.title = inUse ? t('LibraryWindow.in-use') : '';
    });
  }

  /**
   * Marks the map set in use for each grid (#1063): the one the player chose, or, unchosen, the one drawn by default
   *  (`mapTileset`), and puts its Use out of use, as the themes' are. During a game whose rule set names its own art
   *  for a grid (Civ2's), the others' Use for that grid is out of use too, saying why: choosing one would change
   *  nothing in this game (#1144).
   */
  #markMapUses(): void {
    this.#mapUses.forEach(({ id, grid, inUse, use }) => {
      const used = mapTileset(grid).id === id,
        rules = this.#inGame ? ruleSetMapTileset(grid) : null,
        ruled = !used && rules !== null && rules.id !== id;

      inUse.hidden = !used;
      use.setAttribute('aria-disabled', String(used || ruled));
      use.title = used
        ? inUse.textContent ?? ''
        : ruled
        ? t('LibraryWindow.rule-set-art', {
            name: rules!.name,
            grid: t(`Grid.${grid}`).toLocaleLowerCase(i18next.language),
            interpolation: { escapeValue: false },
          })
        : '';
    });
  }

  /** `pack`'s own import, over this window if it's modal, and the statuses said again once it's closed. */
  #openImport(pack: PackImport): void {
    new ImportAssetsWindow(pack, { modal: this.#modal }).on('close', () => {
      void this.refresh().catch((error) => console.error(error));
    });
  }
}

export default LibraryWindow;
