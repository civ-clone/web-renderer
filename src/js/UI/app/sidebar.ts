import { AppElements } from './elements';
import SidebarSection from '../components/SidebarSection';
import { t } from 'i18next';

// Wraps the sidebar's panels in sections that can be collapsed (#697). Once a page: the panels are the page's own, and
//  each game draws into them.
export const buildSidebar = (
  sidebar: HTMLElement,
  { minimapCanvas, unitInfo }: Pick<AppElements, 'minimapCanvas' | 'unitInfo'>
): void => {
  sidebar.append(
    new SidebarSection('world', t('Sidebar.world'), [minimapCanvas]).element(),
    new SidebarSection('unit', t('Sidebar.unit'), [unitInfo]).element()
  );
};

export default buildSidebar;
