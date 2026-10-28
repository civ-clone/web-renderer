import { AppElements } from './elements';
import SidebarSection from '../components/SidebarSection';
import { t } from 'i18next';

// Wraps the sidebar's panels in sections that can be collapsed (#697). Once a page: the panels are the page's own, and
//  each game draws into them. The cities (#700) and power (#701, #708) start collapsed, until the player opens them.
export const buildSidebar = (
  sidebar: HTMLElement,
  {
    minimapCanvas,
    unitInfo,
    citiesList,
    powerList,
  }: Pick<
    AppElements,
    'minimapCanvas' | 'unitInfo' | 'citiesList' | 'powerList'
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

  if (powerList) {
    sidebar.append(
      new SidebarSection('power', t('Sidebar.power'), [powerList], undefined, {
        collapsedByDefault: true,
      }).element()
    );
  }
};

export default buildSidebar;
