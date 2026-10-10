import Window from './Window';
import { s } from '@dom111/element';
import releases from '../../../../changelog/releases.json';
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

export class ReleaseWindow extends Window {
  constructor() {
    super(
      'Releases',
      s(
        `<section></section>`,
        s(
          `<div class="release-list"></div>`,
          // One entry per day, however many commits landed (#355). A day with
          // nothing to show would render as a heading above an empty block.
          ...byDay(releases as Release[])
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
    <h3>External changes</h3>
    
    <dl>
      ${Object.entries(release.externalChanges)
        .map(
          ([module, { status, log: changes }]) => `<dd>${status} ${module}</dd>
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
            })
        )
      ),
      {
        canMaximise: true,
        canResize: true,
        classes: 'releases',
      }
    );

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
}

export default ReleaseWindow;
