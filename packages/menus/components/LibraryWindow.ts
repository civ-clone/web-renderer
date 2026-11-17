import {
  PackImport,
  filesNeeded,
  importedFirst,
  packImportOf,
  packImports,
} from '@civ-clone/ui-assets/lib/packImports';
import {
  SetLicence,
  SetSource,
} from '@civ-clone/ui-assets/tilesets/TilesetDescriptor';
import Window, { WindowOptions } from '@civ-clone/ui-component-window/Window';
import { currentUiTheme, uiThemes } from '@civ-clone/ui-widgets/lib/theme';
import ImportAssetsWindow from './ImportAssetsWindow';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import { bundledTilesets } from '@civ-clone/ui-assets/lib/tilesets';
import { button } from '@civ-clone/ui-component-button/button';
import chooseUiTheme from '../lib/chooseUiTheme';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { s } from '@dom111/element';
import { soundSets } from '@civ-clone/ui-assets/sounds/SoundDescriptor';
import { t } from 'i18next';
// Civilization's music, a set of its own: registered wherever the library can open.
import '../lib/civ1Sound';

// The library of art and sound (#1063): every set the game can draw or play with, by what it is for (the map's art by
//  grid, the interface's themes, the sound), saying where each comes from, whether it's ready, and opening its import.
//  It replaces Import assets: the imports are each set's own (`ImportAssetsWindow`), and Civ1's comes first.

/** A set as the library lists it: its manifest's head, what it gives the game, and its import if it has one. */
interface LibrarySet {
  id: string;
  name: string;
  source?: SetSource;
  licence?: SetLicence;
  provides: string[];
  pack?: PackImport;
}

/** A set with an import, and the parts of its entry that change: its status, its button and why that's disabled. */
interface Entry {
  pack: PackImport;
  status: HTMLElement;
  importButton: HTMLButtonElement;
  reason: HTMLElement;
}

/** A theme's entry, and the parts of it that change with the theme in use. */
interface ThemeEntry {
  id: string;
  status: HTMLElement;
  use: HTMLButtonElement;
}

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

/** The sets with art for the map, by grid, in the order the grids' first sets were registered. */
const mapSets = (): [string, LibrarySet[]][] => {
  const grids = new Map<string, LibrarySet[]>();

  bundledTilesets().forEach(({ id, name, grid, source, licence, assets }) =>
    grids.set(grid, [
      ...(grids.get(grid) ?? []),
      {
        id,
        name,
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

// Ids for what a button is described by, unique however many libraries are open.
let described = 0;

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

export class LibraryWindow extends Window {
  #entries: Entry[];
  #themes: ThemeEntry[] = [];
  #storageBlocked: HTMLDivElement;
  // Over Options, which is modal before a game: the import it opens must be too, or it would open behind it.
  #modal: boolean;

  constructor(windowOptions: WindowOptions = {}) {
    const storageBlocked = s<HTMLDivElement>(
        '<div class="storage-blocked" role="alert" hidden></div>'
      ),
      themes = s<HTMLUListElement>('<ul class="library-sets"></ul>'),
      entries: Entry[] = [],
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

        if (set.source === 'hosted') {
          status.textContent = t('LibraryWindow.status.ready');
          status.dataset.state = 'ready';
        }

        const pack = set.pack;

        if (pack === undefined) {
          return element;
        }

        // Disabled until the store says whether it can be imported.
        const importButton = h(
            button(t('LibraryWindow.import'), { disabled: true }),
            {
              click: () => this.#openImport(pack),
            }
          ),
          reason = s<HTMLElement>('<span class="reason" hidden></span>');

        // Named for its set, and described by why it can't be used yet.
        reason.id = `library-reason-${++described}`;
        importButton.setAttribute('aria-describedby', reason.id);
        importButton.setAttribute(
          'aria-label',
          t('LibraryWindow.import-set', {
            name: set.name,
            interpolation: { escapeValue: false },
          })
        );

        entries.push({ pack, status, importButton, reason });

        element.append(s('<div class="actions"></div>', importButton, reason));

        return element;
      };

    super(
      t('LibraryWindow.title'),
      s(
        '<div class="library"></div>',
        storageBlocked,
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
          themes
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
    this.#storageBlocked = storageBlocked;
    this.#modal = windowOptions.modal ?? false;

    this.addClass('library-window');

    themes.append(...this.#themeEntries());
    this.#markThemes();

    // A store that can't be read leaves the imports as they were drawn.
    void this.refresh().catch((error) => console.error(error));
  }

  /**
   * Says what each set with an import is (Ready, Needs …, Not imported), and which can be imported: none when the
   *  browser keeps nothing for this site (#850), and only the first set (`importedFirst`) until its sprites are in.
   *  As the window opens, and again once an import window it opened is closed.
   */
  async refresh(): Promise<void> {
    const first = packImports().find(importedFirst),
      [usable, firstReady, statuses] = await Promise.all([
        assetStore.usable(),
        first?.ready() ?? Promise.resolve(true),
        Promise.all(
          this.#entries.map(({ pack }) =>
            setStatus(pack).catch((): null => null)
          )
        ),
      ]);

    this.#storageBlocked.textContent = usable
      ? ''
      : t('ImportAssetsWindow.storage-blocked');
    this.#storageBlocked.toggleAttribute('hidden', usable);

    this.#entries.forEach(({ pack, status, importButton, reason }, index) => {
      const shown = statuses[index] ?? null,
        waiting = !importedFirst(pack) && !firstReady;

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
      importButton.disabled = !usable || waiting;

      // Why it can't be imported yet: the storage's reason is said once, above everything.
      reason.textContent =
        usable && waiting && first !== undefined
          ? t('LibraryWindow.import-first', {
              name: first.name,
              interpolation: { escapeValue: false },
            })
          : '';
      reason.toggleAttribute('hidden', reason.textContent === '');
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

            // Only before a game, which the library is opened from: new interface art loads the page again.
            chooseUiTheme(id);
            this.#markThemes();
          },
        }),
        element = s<HTMLLIElement>(
          '<li class="library-set"></li>',
          s('<div class="library-set-head"></div>', label, status),
          s('<div class="actions"></div>', use)
        );

      element.dataset.theme = id;
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

  /** `pack`'s own import, over this window if it's modal, and the statuses said again once it's closed. */
  #openImport(pack: PackImport): void {
    new ImportAssetsWindow(pack, { modal: this.#modal }).on('close', () => {
      void this.refresh().catch((error) => console.error(error));
    });
  }
}

export default LibraryWindow;
