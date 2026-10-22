import Window from './Window';
import { s } from '@dom111/element';
import { instance as localeProvider } from '../LocaleProvider';
import { marked } from 'marked';
import { Release, byDay } from '../lib/releaseDays';
import { t } from 'i18next';

const bullets = (changes: string[], indent: string): string =>
  changes
    .map(
      (change) =>
        `<li>${marked(change.replace(/^\s*-\s*/, '').trim(), {
          sanitize: true,
        })}</li>`
    )
    .join(`\n${indent}`);

const firstParentMatching = (
  target: HTMLElement,
  targetSelector: string
): HTMLElement => {
  while (!target?.matches(targetSelector)) {
    if (!(target instanceof HTMLElement)) {
      throw new TypeError(`Can't find a match for ${targetSelector}`);
    }

    target = target.parentElement as HTMLElement;
  }

  return target;
};

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
    <h2>${
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
        <dd>${t('ReleaseWindow.behind-the-scenes')}</dd>
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
            ([
              module,
              { status, log: changes },
            ]) => `<dd>${status} ${module}</dd>
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

    this.on('click', (event) => {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }

      if (event.target.matches('dd, dd *')) {
        toggleExpanded(
          firstParentMatching(event.target, 'dd').nextElementSibling,
          'dt'
        );
      }

      if (event.target.matches('.release h2, .release h2 *')) {
        toggleExpanded(
          firstParentMatching(event.target, 'h2').nextElementSibling,
          'div'
        );
      }
    });
  }

  /** Settles once the notes are shown, or the failure to load them is. */
  loaded(): Promise<void> {
    return this.#loaded;
  }
}

export default ReleaseWindow;
