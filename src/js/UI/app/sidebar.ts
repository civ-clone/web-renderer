import { AppElements } from './elements';
import SidebarSection from '../components/SidebarSection';
import { t } from 'i18next';

// Wraps the sidebar's panels in sections that can be collapsed (#697). Once a page: the panels are the page's own, and
//  each game draws into them. The cities (#700) and scores (#701) start collapsed, until the player opens them.
export const buildSidebar = (
  sidebar: HTMLElement,
  {
    minimapCanvas,
    unitInfo,
    citiesList,
    scoresList,
  }: Pick<
    AppElements,
    'minimapCanvas' | 'unitInfo' | 'citiesList' | 'scoresList'
  >
): void => {
  sidebar.append(
    new SidebarSection('world', t('Sidebar.world'), [minimapCanvas]).element(),
    new SidebarSection('unit', t('Sidebar.unit'), [unitInfo]).element()
  );

  if (citiesList) {
    sidebar.append(
      new SidebarSection(
        'cities',
        t('Sidebar.cities'),
        [citiesList],
        undefined,
        {
          collapsedByDefault: true,
        }
      ).element()
    );
  }

  if (scoresList) {
    sidebar.append(
      new SidebarSection(
        'scores',
        t('Sidebar.scores'),
        [scoresList],
        undefined,
        {
          collapsedByDefault: true,
        }
      ).element()
    );
  }
};

export default buildSidebar;
