import Window from './Window';
import { s } from '@dom111/element';
import { instance as localeProvider } from '../LocaleProvider';
import { Marked } from 'marked';
import { Release, byDay } from '../lib/releaseDays';
import { glyph } from '../lib/glyphs';
import { t } from 'i18next';

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[character]!)
  );

// The notes' Markdown, with any HTML in them shown as text, as marked's `sanitize` did before marked removed it (#583).
//  Links and images are shown as their text, so a note can't load or link to anything.
const notes = new Marked({
  renderer: {
    html: ({ text }) => escapeHtml(text),
    image: ({ text }) => escapeHtml(text),
    link({ tokens }) {
      return this.parser.parseInline(tokens);
    },
  },
});

const bullets = (changes: string[], indent: string): string =>
  changes
    .map(
      (change) =>
        `<li>${notes.parse(change.replace(/^\s*-\s*/, '').trim(), {
          async: false,
        })}</li>`
    )
    .join(`\n${indent}`);

const toggleExpanded = (target: Node | null, expectedSelector: string) => {
  if (!(target instanceof HTMLElement) || !target.matches(expectedSelector)) {
    return;
  }

  const targetIsVisible = target.getAttribute('aria-expanded') === 'true';

  target.setAttribute('aria-expanded', targetIsVisible ? 'false' : 'true');
};

/**
 * The release notes, fetched when the window opens rather than bundled into `frontend.js`, where they were most of
 * its size (#476). `version` (from `build.json`) keeps a cached copy from outliving a deploy.
 */
export const fetchReleases = (version: string): Promise<Release[]> =>
  fetch(`dist/releases.json?v=${encodeURIComponent(version)}`).then(
    (response) => {
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return response.json();
    }
  );

const renderReleases = (releases: Release[]): HTMLElement[] =>
  // One entry per day, however many commits landed (#355). A day with
  // nothing to show would render as a heading above an empty block.
  byDay(releases)
    .filter(
      (release) =>
        release.localChanges.length > 0 ||
        release.devChanges.length > 0 ||
        Object.keys(release.externalChanges).length > 0
    )
    .map((release, i) => {
      const releaseDate = new Date(release.date);

      return s(
        `<div class="release">
    <h2>${glyph('arrow-right')}${
          release.version
        } - <time title="${releaseDate.toLocaleString()}">${localeProvider.timeSince(
          releaseDate
        )}</time></h2>

    <div aria-expanded="${i === 0 ? 'true' : 'false'}">
      ${
        release.localChanges.length > 0
          ? `
      <ul>
        ${bullets(release.localChanges, '      ')}
      </ul>
    `
          : ''
      }

      ${
        release.devChanges.length > 0
          ? `
      <dl>
        <dd>${glyph('arrow-right')}${t('ReleaseWindow.behind-the-scenes')}</dd>
        <dt aria-expanded="false">
          <ul>
            ${bullets(release.devChanges, '          ')}
          </ul>
        </dt>
      </dl>
    `
          : ''
      }

      ${
        Object.keys(release.externalChanges).length > 0
          ? `
      <h3>${t('ReleaseWindow.external-changes')}</h3>

      <dl>
        ${Object.entries(release.externalChanges)
          .map(
            ([module, { status, log: changes }]) => `<dd>${glyph(
              'arrow-right'
            )}${status} ${module}</dd>
        <dt aria-expanded="false">
          <ul>
            ${bullets(changes ?? [], '          ')}
          </ul>
        </dt>`
          )
          .join('\n    ')}
      </dl>
    </div>
  `
          : ''
      }
  </div>`
      );
    });

export class ReleaseWindow extends Window {
  #loaded: Promise<void>;

  constructor(load: () => Promise<Release[]>) {
    const list = s(
      `<div class="release-list"><p>${t('ReleaseWindow.loading')}</p></div>`
    );

    super(t('ReleaseWindow.title'), s(`<section></section>`, list), {
      canMaximise: true,
      canResize: true,
      classes: 'releases',
    });

    // Notes that load but can't be shown fail the same way as notes that don't load.
    this.#loaded = load()
      .then((releases) => {
        const rendered = renderReleases(releases);

        list.innerHTML = '';
        list.append(...rendered);
      })
      .catch((error) => {
        console.error(error);

        list.innerHTML = '';
        list.append(s(`<p>${t('ReleaseWindow.failed')}</p>`));
      });

    // The target can be a glyph's `<svg>`, which isn't an `HTMLElement`.
    this.on('click', (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      toggleExpanded(
        event.target.closest('dd')?.nextElementSibling ?? null,
        'dt'
      );
      toggleExpanded(
        event.target.closest('.release h2')?.nextElementSibling ?? null,
        'div'
      );
    });
  }

  /** Settles once the notes are shown, or the failure to load them is. */
  loaded(): Promise<void> {
    return this.#loaded;
  }
}

export default ReleaseWindow;
