import { Element, s } from '@dom111/element';
import GameOptionsRegistry, {
  instance as defaultOptions,
} from '../GameOptionsRegistry';

// The client option holding the keys of the collapsed sections, kept in browser storage like the others (#343).
export const collapsedOption = 'sidebarCollapsed';

// And the one holding the keys of the sections that start collapsed but have been opened (#700, #701). Apart from
//  `sidebarCollapsed`, which players already have stored, so neither changes what the other means.
export const expandedOption = 'sidebarExpanded';

// Fired on the section when it's collapsed or expanded, for content that waits to be seen (the scores, #701).
export const toggleEvent = 'sidebar-section-toggle';

export type SidebarSectionSettings = {
  // Collapsed until the player opens it, as the Cities and Scores sections are (#700, #701).
  collapsedByDefault?: boolean;
};

/**
 * A titled part of the sidebar that can be collapsed (#697). The heading is a button, so a click, Enter or Space
 *  toggles it, and the choice outlives a reload. One collapsed by default stays so until the player opens it.
 */
export class SidebarSection extends Element {
  #body: HTMLElement;
  #collapsedByDefault: boolean;
  #key: string;
  #options: GameOptionsRegistry;
  #toggle: HTMLButtonElement;

  constructor(
    key: string,
    title: string,
    content: Node[],
    options: GameOptionsRegistry = defaultOptions,
    { collapsedByDefault = false }: SidebarSectionSettings = {}
  ) {
    const bodyId = `sidebar-section-${key}`;

    super(
      s(
        `<section class="sidebar-section" data-section="${key}"><h2><button type="button" aria-controls="${bodyId}"></button></h2><div class="body" id="${bodyId}"></div></section>`
      )
    );

    this.#collapsedByDefault = collapsedByDefault;
    this.#key = key;
    this.#options = options;
    this.#toggle = this.element().querySelector('button') as HTMLButtonElement;
    this.#body = this.element().querySelector('.body') as HTMLElement;

    // As text: a heading is a translation, not markup.
    this.#toggle.textContent = title;
    this.#body.append(...content);

    this.#toggle.addEventListener('click', () =>
      this.setCollapsed(!this.collapsed())
    );

    this.#show(
      collapsedByDefault
        ? !this.#stored(expandedOption).includes(key)
        : this.#stored(collapsedOption).includes(key)
    );
  }

  body(): HTMLElement {
    return this.#body;
  }

  collapsed(): boolean {
    return this.#toggle.getAttribute('aria-expanded') === 'false';
  }

  setCollapsed(collapsed: boolean): void {
    this.#show(collapsed);

    // A section that starts collapsed records being open; any other, being collapsed.
    const [option, listed] = this.#collapsedByDefault
        ? [expandedOption, !collapsed]
        : [collapsedOption, collapsed],
      others = this.#stored(option).filter((key) => key !== this.#key);

    this.#options.set(option, listed ? [...others, this.#key] : others);

    this.element().dispatchEvent(new Event(toggleEvent));
  }

  #show(collapsed: boolean): void {
    this.#toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    this.#body.hidden = collapsed;
  }

  #stored(option: string): string[] {
    const stored = this.#options.get(option, []);

    return Array.isArray(stored) ? stored : [];
  }
}

export default SidebarSection;
