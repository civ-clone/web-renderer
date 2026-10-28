import { Element, s } from '@dom111/element';
import GameOptionsRegistry, {
  instance as defaultOptions,
} from '../GameOptionsRegistry';

// The client option holding the keys of the collapsed sections, kept in browser storage like the others (#343).
export const collapsedOption = 'sidebarCollapsed';

/**
 * A titled part of the sidebar that can be collapsed (#697). The heading is a button, so a click, Enter or Space
 *  toggles it, and the choice outlives a reload.
 */
export class SidebarSection extends Element {
  #body: HTMLElement;
  #key: string;
  #options: GameOptionsRegistry;
  #toggle: HTMLButtonElement;

  constructor(
    key: string,
    title: string,
    content: Node[],
    options: GameOptionsRegistry = defaultOptions
  ) {
    const bodyId = `sidebar-section-${key}`;

    super(
      s(
        `<section class="sidebar-section" data-section="${key}"><h2><button type="button" aria-controls="${bodyId}"></button></h2><div class="body" id="${bodyId}"></div></section>`
      )
    );

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

    this.#show(this.#stored().includes(key));
  }

  body(): HTMLElement {
    return this.#body;
  }

  collapsed(): boolean {
    return this.#toggle.getAttribute('aria-expanded') === 'false';
  }

  setCollapsed(collapsed: boolean): void {
    this.#show(collapsed);

    const others = this.#stored().filter((key) => key !== this.#key);

    this.#options.set(
      collapsedOption,
      collapsed ? [...others, this.#key] : others
    );
  }

  #show(collapsed: boolean): void {
    this.#toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    this.#body.hidden = collapsed;
  }

  #stored(): string[] {
    const stored = this.#options.get(collapsedOption, []);

    return Array.isArray(stored) ? stored : [];
  }
}

export default SidebarSection;
