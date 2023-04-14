import Window from './Window';
import { s } from '@dom111/element';
import releases from '../../../../changelog/releases.json';
import { instance as localeProvider } from '../LocaleProvider';
import { marked } from 'marked';

interface Release {
  version: string;
  date: string;
  localChanges: string[];
  externalChanges: {
    [key: string]: {
      status: 'added' | 'removed' | 'updated';
      log: string[];
    };
  };
}

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
          ...(releases as Release[]).map((release, i) => {
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
      ${release.localChanges
        .map(
          (line) =>
            `<li>${marked(line.replace(/^\s*-\s*/, '').trim(), {
              sanitize: true,
            })}</li>`
        )
        .join('\n      ')}
    </ul>
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
          ${(changes ?? [])
            .map(
              (change) =>
                `<li>${marked(change.replace(/^\s*-\s*/, '').trim(), {
                  sanitize: true,
                })}</li>`
            )
            .join('\n          ')}
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
